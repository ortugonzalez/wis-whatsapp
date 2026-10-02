import { createBlocklistInvalidation } from './blocklist-invalidation.mjs';
import { attachGroupMemberTags } from './group-member-tags.mjs';
import { attachAccountSettings } from './account-settings.mjs';
import { attachNewsletterEvents } from './newsletter-events.mjs';
import { randomUUID } from 'node:crypto';
import { LOCAL_LIMITS } from './limits.mjs';
import { createPublicCatalogReader, PublicCatalogError } from './catalog-http.mjs';
import { createWebhookDispatcher } from './webhooks.mjs';
import { cacheAvatar } from './avatars.mjs';
import { archiveRejectedAuthDirectory } from './auth-recovery.mjs';
import { groupMetadataByInviteCode, validGroupInviteCode } from './group-invite-info.mjs';
import { newsletterByInviteMetadata, validNewsletterInviteCode } from './newsletter-invite-info.mjs';
import { selectKnownNewsletterTargets } from './known-newsletters.mjs';
import { normalizeDisappearingModeReply, isKnownChatJid } from './disappearing-mode.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mergeAccountLimitsSnapshot } from './account-limits-snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireWorker = createRequire(resolve(root, 'package.json'));
export function timestamp(value) {
  try {
    const n = Number(value && typeof value.toNumber === 'function' ? value.toNumber() : value);
    return Number.isFinite(n) && n > 0 && n < Date.now() / 1000 + 300 ? new Date(Math.floor(n) * 1000).toISOString() : null;
  } catch { return null; }
}
export function identityMatches(phone, expected) {
  return Boolean(/^\+[1-9]\d{7,14}$/.test(expected || '') && String(phone || '').replace(/\D/g, '') === expected.slice(1));
}
export function reconnectDecision({attempts=0,lastOpenedAt=0,now=Date.now(),maxAttempts=5,stableMs=60000}={}) {
  const prior=lastOpenedAt>0&&now-lastOpenedAt>=stableMs?0:attempts;
  const nextAttempts=prior+1;
  return {attempts:nextAttempts,retry:nextAttempts<=maxAttempts,delay_ms:Math.min(60000,2000*2**(nextAttempts-1))};
}
const connectionCloseReasons=Object.freeze({401:'logged_out',403:'forbidden',408:'timed_out',411:'multidevice_mismatch',428:'connection_closed',440:'connection_replaced',500:'bad_session',503:'unavailable_service',515:'restart_required'});
export function acquireLease(db, owner, now = Date.now()) {
  return db.prepare(`UPDATE connections SET lease_owner=?,lease_expires_at=? WHERE id='wis-5679' AND (lease_owner=? OR lease_expires_at IS NULL OR lease_expires_at<=?)`)
    .run(owner, new Date(now + 30000).toISOString(), owner, new Date(now).toISOString()).changes === 1;
}
export function mediaFile(base, path) {
  const full = resolve(base, path);
  const rel = relative(base, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('invalid_media_path');
  return full;
}

// Explicit allowlists: socket/auth objects, QR data and group invite codes never enter snapshots.
export function safeFields(value, keys) {
  const result = {};
  for (const key of keys) {
    const item = value?.[key];
    if (item === null || typeof item === 'boolean') result[key] = item;
    else if (typeof item === 'string') result[key] = item.slice(0, 8192);
    else if (typeof item === 'number' && Number.isFinite(item)) result[key] = item;
    else if (item instanceof Date && !Number.isNaN(item.getTime())) result[key] = item.toISOString();
    else if (item && typeof item.toNumber === 'function') {
      const n = item.toNumber(); if (Number.isSafeInteger(n)) result[key] = n;
    }
  }
  return result;
}
const contactKeys = ['id','lid','phoneNumber','name','notify','verifiedName','username','status'];
export function safeGroup(group) {
  // Keep provider-supported group metadata that Baileys exposes, while excluding
  // inviteCode: it is an access link and must never enter persisted snapshots.
  const value = safeFields(group, ['id','notify','subject','owner','ownerPn','ownerUsername','owner_country_code','subjectOwner','subjectOwnerPn','subjectOwnerUsername','subjectTime','creation','desc','descOwner','descOwnerPn','descOwnerUsername','descId','descTime','linkedParent','restrict','announce','memberAddMode','joinApprovalMode','isCommunity','isCommunityAnnounce','size','ephemeralDuration','addressingMode','author','authorPn','authorUsername']);
  if (Array.isArray(group?.participants)) value.participants = group.participants.slice(0,4096).map(p=>safeFields(p,[...contactKeys,'admin','isAdmin','isSuperAdmin']));
  return value;
}
export function safeProduct(product) {
  product={...product,id:product?.id ?? product?.product_id,retailerId:product?.retailerId ?? product?.retailer_id,isHidden:product?.isHidden ?? product?.is_hidden,availability:product?.availability ?? product?.product_availability};
  // Product image URLs may contain signed CDN credentials; expose availability only.
  return {...safeFields(product,['id','name','retailerId','description','price','currency','isHidden','availability']),has_images:Object.values(product?.imageUrls || {}).some(x=>typeof x==='string'),review_status:safeFields(product?.reviewStatus,['status','canAppeal'])};
}
export function safeNewsletter(value) {
  return {...safeFields(value,['id','owner','name','description','creation_time','subscribers','verification','mute_state']),has_picture:Boolean(value?.picture?.id || value?.picture?.url),thread_metadata:safeFields(value?.thread_metadata,['creation_time','name','description']),reaction_codes:(value?.reaction_codes || []).slice(0,100).map(x=>safeFields(x,['code','count']))};
}
export function callSnapshot(value,prior={},now=new Date().toISOString()) {
  if(typeof value?.id!=='string'||!/^[\x21-\x7e]{1,256}$/.test(value.id))return null;
  const statuses=['offer','ringing','preaccept','transport','relaylatency','timeout','reject','accept','terminate'];
  if(!statuses.includes(value.status))return null;
  let date=null;
  if(value.date instanceof Date && Number.isFinite(value.date.getTime()))date=value.date.toISOString();
  else if(typeof value.date==='string' && /^\d{4}-\d\d-\d\dT/.test(value.date) && Number.isFinite(Date.parse(value.date)))date=new Date(value.date).toISOString();
  const fields=safeFields(value,['id','from','chatId','callerPn','groupJid','isGroup','isVideo','offline','latencyMs']);
  for(const key of ['from','chatId','callerPn','groupJid'])if(typeof fields[key]!=='string'||fields[key].length>256)delete fields[key];
  const history=Array.isArray(prior.history)?prior.history.slice(-50).map(x=>safeFields(x,['status','date','observed_at'])):[];
  if(!history.some(x=>x.status===value.status&&x.date===date))history.push({status:value.status,date,observed_at:now});
  if(history.length>50)history.shift();
  const newer=date && (!prior.last_event_at || date>=prior.last_event_at);
  const base=safeFields(prior,['id','from','chatId','callerPn','groupJid','isGroup','isVideo','offline','latencyMs','status','date','last_event_at']);
  return {...base,...fields,...(newer||!prior.status?{status:value.status,date,...(date?{last_event_at:date}:{})}:{}),observed_at:now,history};
}
export function classifyReadError(error) {
  // Never expose provider messages/data: they can contain request material.
  const local={read_timeout:'read_timeout',public_catalog_http_timeout:'read_timeout',previous_read_unresolved:'read_pending',connection_unavailable:'disconnected',connection_changed:'disconnected',capability_unavailable:'method_missing',account_identity_unavailable:'identity_unavailable',invalid_target:'invalid_target',unknown_community:'unknown_target',unknown_newsletter:'unknown_target',unsupported_read_command:'method_missing',newsletter_unavailable:'not_found',invalid_newsletter_metadata_response:'invalid_response',invalid_newsletter_count_response:'invalid_response',no_exact_disappearing_mode_reply:'response_unmatched',disappearing_mode_not_returned:'not_found',order_message_unavailable:'order_message_unavailable',order_credential_unavailable:'order_credential_unavailable'};
  const marker=typeof error?.message==='string'?error.message:'';
  const candidate=error?.output?.statusCode ?? error?.statusCode ?? error?.status ?? error?.status_code;
  const status_code=Number.isInteger(candidate) && candidate>=100 && candidate<=599?candidate:null;
  let code=Object.hasOwn(local,marker)?local[marker]:undefined;
  if(['public_catalog_unavailable','graphql_error','access_denied','rate_limited','transport_failed','public_catalog_config_unavailable'].includes(marker))code=marker;
  if(['avatar_unavailable','avatar_destination_rejected','avatar_download_failed','avatar_timeout','avatar_too_large','invalid_avatar_media'].includes(marker))code=marker;
  if(!code && marker.startsWith('invalid_') && marker.endsWith('_response'))code='invalid_response';
  if(!code)code=status_code===401 || status_code===403?'access_denied':status_code===404?'not_found':status_code===429?'rate_limited':status_code===408 || status_code===504?'read_timeout':status_code && status_code>=500?'provider_error':'read_failed';
  const phase=['public_catalog_page_discovery','public_catalog_bundle_scan','public_catalog_query','public_collections_query','public_catalog_read_deadline','baileys_get_catalog','baileys_get_collections'].includes(error?.phase)?error.phase:null;
  return {code,status_code,...(phase?{phase}:{}),...(Number.isSafeInteger(error?.provider_code)?{provider_code:error.provider_code}:{})};
}
function canFallbackPublicCatalog(error) {
  return error?.code==='public_catalog_unavailable' || error instanceof PublicCatalogError && ['public_catalog_http_timeout','read_timeout','transport_failed'].includes(error.code);
}
export function readBudgetMs(method, override) {
  if(override!==undefined) {
    if(!Number.isFinite(override) || override<=0 || override>120000)throw new Error('invalid_read_timeout');
    return override;
  }
  // The provider IQ has its own timeout; keep the outer budget longer so it
  // can settle before the worker reports a timeout and retains its read lock.
  if(method==='getCatalog')return 100000;
  return method==='getCollections'?35000:12000;
}
export function readCallBudgetMs(method, override) {
  // This is a per-call limit. Catalog commands additionally have an absolute
  // end-to-end deadline so pagination and fallback cannot multiply this budget.
  return ['publicCatalog','publicCollections'].includes(method)&&override===undefined?210000:readBudgetMs(method,override);
}
export async function checkedGroupInvite(socket,target) {
  if(!/^\d+(?:-\d+)?@g\.us$/.test(target||''))throw Error('invalid_target');
  const reply=await socket.query({tag:'iq',attrs:{to:target,type:'get',xmlns:'w:g2'},content:[{tag:'invite',attrs:{}}]},10000);
  if(!reply)throw Error('read_timeout');
  const nodes=Array.isArray(reply.content)?reply.content:[],error=nodes.find(x=>x?.tag==='error');
  if(reply.attrs?.type==='error'||error){const code=Number(error?.attrs?.code);throw Object.assign(Error('provider_error'),{statusCode:Number.isInteger(code)&&code>=100&&code<=599?code:undefined});}
  const invites=nodes.filter(x=>x?.tag==='invite');
  if(reply.tag!=='iq'||reply.attrs?.type!=='result'||invites.length!==1||typeof invites[0].attrs?.code!=='string'||!/^[A-Za-z0-9]{10,128}$/.test(invites[0].attrs.code))throw Error('invalid_response');
  return invites[0].attrs.code;
}
export async function checkedCommunityInviteCode(socket,target) {
  if(!/^\d+(?:-\d+)?@g\.us$/.test(target||''))throw Error('invalid_target');
  if(typeof socket?.communityInviteCode!=='function')throw Error('capability_unavailable');
  const code=await socket.communityInviteCode(target);
  if(typeof code!=='string'||!/^[A-Za-z0-9_-]{10,128}$/.test(code))throw Error('invalid_response');
  return code;
}
export function expireGroupInvites(db,now=new Date().toISOString()) {
  db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.code',NULL,'$.expires_at',NULL,'$.available',json('false'),'$.expired',json('true'),'$.stale',json('false')),updated_at=? WHERE kind IN('group_invite','community_invite') AND (json_extract(payload,'$.expires_at') IS NULL OR json_extract(payload,'$.expires_at')<=?) AND json_extract(payload,'$.code') IS NOT NULL").run(now,now);
}
export async function checkedGroupRead(socket,method,target) {
  if(!['community_subgroups','group_requests'].includes(method)||!/^\d+(?:-\d+)?@g\.us$/.test(target||''))throw Error('invalid_target');
  if(typeof socket?.query!=='function')throw Error('capability_unavailable');
  const tag=method==='community_subgroups'?'sub_groups':'membership_approval_requests',child=method==='community_subgroups'?'group':'membership_approval_request';
  const reply=await socket.query({tag:'iq',attrs:{to:target,type:'get',xmlns:'w:g2'},content:[{tag,attrs:{}}]},10000);
  if(!reply)throw Error('read_timeout');
  if(reply.attrs?.type==='error'){const code=Number(reply.content?.find(x=>x.tag==='error')?.attrs?.code);throw Object.assign(Error('provider_error'),{statusCode:Number.isInteger(code)?code:undefined});}
  const container=Array.isArray(reply.content)?reply.content.find(x=>x.tag===tag):null;
  if(reply.tag!=='iq'||reply.attrs?.type!=='result'||!container||container.content!==undefined&&!Array.isArray(container.content))throw Error('invalid_group_response');
  if((container.content||[]).some(x=>x.tag!==child))throw Error('invalid_group_response');
  const rows=(container.content||[]).map(x=>{
    if(method==='community_subgroups') {
      if(!/^\d+(?:-\d+)?$/.test(x.attrs?.id || ''))throw Error('invalid_group_response');
      const owner=typeof x.attrs.creator==='string'?x.attrs.creator.replace(/:\d+(?=@)/,''):'';
      return {id:x.attrs.id+'@g.us',...safeFields(x.attrs,['subject']),...safeFields({creation:x.attrs.creation?Number(x.attrs.creation):undefined,size:x.attrs.size?Number(x.attrs.size):undefined,owner:/^\d+@(s\.whatsapp\.net|lid)$/.test(owner)?owner:undefined},['creation','size','owner'])};
    }
    if(!/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(x.attrs?.jid || ''))throw Error('invalid_group_response');
    return safeFields(x.attrs,['jid','request_method','request_time']);
  });
  return {rows:rows.slice(0,2000),truncated:rows.length>2000};
}
export async function checkedAccountLimits(socket,kind) {
  if(!['quota','timelock'].includes(kind))throw Error('invalid_target');
  const quota=kind==='quota',queryId=quota?'24503548349331633':'23983697327930364',path=quota?'xwa2_message_capping_info':'xwa2_fetch_account_reachout_timelock';
  const reply=await socket.query({tag:'iq',attrs:{type:'get',to:'s.whatsapp.net',xmlns:'w:mex'},content:[{tag:'query',attrs:{query_id:queryId},content:Buffer.from(JSON.stringify({variables:quota?{input:{type:'INDIVIDUAL_NEW_CHAT_MSG'}}:{}}))}]},10000);
  if(!reply)throw Error('read_timeout');
  if(reply.attrs?.type==='error'){const code=Number(reply.content?.find(x=>x.tag==='error')?.attrs?.code);throw Object.assign(Error('provider_error'),{statusCode:code});}
  const content=reply.content?.find(x=>x.tag==='result')?.content;
  if(reply.tag!=='iq'||reply.attrs?.type!=='result'||!Buffer.isBuffer(content)||content.length>1024*1024)throw Error('invalid_limits_response');
  let result;try{result=JSON.parse(content.toString());}catch{throw Error('invalid_limits_response');}
  if(result?.errors?.length)throw Object.assign(Error('provider_error'),{statusCode:result.errors[0]?.extensions?.error_code});
  const value=result?.data?.[path];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_limits_response');
  const output={available:true,response_verified:true,error:null,status_code:null};
  if(quota) {
    for(const key of ['total_quota','used_quota'])output[key]=Number.isSafeInteger(value[key])&&value[key]>=0?value[key]:null;
    for(const key of ['cycle_start_timestamp','cycle_end_timestamp','server_sent_timestamp'])output[key]=typeof value[key]==='string'&&/^\d{1,16}$/.test(value[key])?value[key]:null;
    for(const [key,choices] of [['capping_status',['NONE','FIRST_WARNING','SECOND_WARNING','CAPPED']],['mv_status',['NOT_ELIGIBLE','NOT_ACTIVE','ACTIVE','ACTIVE_UPGRADE_AVAILABLE']],['ote_status',['NOT_ELIGIBLE','ELIGIBLE','ACTIVE_IN_CURRENT_CYCLE','EXHAUSTED']]])output[key]=choices.includes(value[key])?value[key]:null;
  } else {
    output.is_active=typeof value.is_active==='boolean'?value.is_active:null;
    output.time_enforcement_ends=typeof value.time_enforcement_ends==='string'&&/^\d{1,16}$/.test(value.time_enforcement_ends)?value.time_enforcement_ends:null;
    const {ReachoutTimelockEnforcementType}=await import(pathToFileURL(resolve(dirname(requireWorker.resolve('baileys')),'Types/State.js')).href);
    output.enforcement_type=Object.values(ReachoutTimelockEnforcementType).includes(value.enforcement_type)?value.enforcement_type:null;
  }
  const meaningful=Object.entries(output).some(([key,value])=>!['available','response_verified','error','status_code'].includes(key)&&value!==null);
  if(!meaningful)throw Error('invalid_limits_response');
  return output;
}
export async function checkedNewsletterMessages(socket,target) {
  if(!/^\d{1,40}@newsletter$/.test(target||''))throw Error('invalid_target');
  const reply=await socket.query({tag:'iq',attrs:{type:'get',xmlns:'newsletter',to:target},content:[{tag:'message_updates',attrs:{count:'50'}}]},10000);
  if(!reply)throw Error('read_timeout');
  if(!Array.isArray(reply.content))throw Error('invalid_newsletter_response');
  const errorNode=reply.content.find(x=>x.tag==='error');
  if(reply.attrs?.type==='error'||errorNode)throw Object.assign(Error('provider_error'),{statusCode:Number(errorNode?.attrs?.code)});
  const container=reply.content?.find(x=>['message_updates','messages'].includes(x.tag));
  if(reply.tag!=='iq'||reply.attrs?.type!=='result'||!container||container.content!==undefined&&!Array.isArray(container.content))throw Error('invalid_newsletter_response');
  const entries=container.content||[];
  if(entries.some(x=>x.tag!=='message'))throw Error('invalid_newsletter_response');
  const {proto}=await import(pathToFileURL(requireWorker.resolve('baileys')).href);
  const messages=[];
  for(const node of entries.slice(0,50)) {
    const id=node.attrs?.message_id||node.attrs?.server_id||node.attrs?.id;
    if(typeof id!=='string'||!/^[\x21-\x7e]{1,256}$/.test(id))throw Error('invalid_newsletter_response');
    if(node.content!==undefined&&!Array.isArray(node.content))throw Error('invalid_newsletter_response');
    const plaintext=node.content?.find(x=>x.tag==='plaintext')?.content;
    let normalized=null;
    if(plaintext!==undefined){if(!Buffer.isBuffer(plaintext)||plaintext.length>1024*1024)throw Error('invalid_newsletter_response');try{normalized=normalizeContent(proto.Message.decode(plaintext));}catch{throw Error('invalid_newsletter_response');}}
    messages.push({id,...(typeof node.attrs?.server_id==='string'&&/^\d{1,40}$/.test(node.attrs.server_id)?{server_id:node.attrs.server_id}:{}),date:timestamp(node.attrs?.t),type:normalized?.type||'unknown',body:typeof normalized?.body==='string'?normalized.body.slice(0,8192):null,media_available:false});
  }
  return {messages,count:messages.length,truncated:entries.length>=50,partial:true,complete:false,limit:50};
}
export async function checkedBotList(socket) {
  if(typeof socket?.query!=='function')throw Error('capability_unavailable');
  const reply=await socket.query({tag:'iq',attrs:{xmlns:'bot',to:'s.whatsapp.net',type:'get'},content:[{tag:'bot',attrs:{v:'2'}}]},10000);
  if(!reply)throw Error('read_timeout');
  const contents=Array.isArray(reply.content)?reply.content:[];
  const providerError=contents.find(node=>node?.tag==='error');
  if(reply.attrs?.type==='error'||providerError) {
    const candidate=Number(providerError?.attrs?.code??reply.attrs?.code);
    throw Object.assign(Error('provider_error'),{statusCode:Number.isInteger(candidate)&&candidate>=100&&candidate<=599?candidate:undefined});
  }
  const botNodes=contents.filter(node=>node?.tag==='bot');
  if(reply.tag!=='iq'||reply.attrs?.type!=='result'||botNodes.length!==1||!Array.isArray(botNodes[0].content))throw Error('invalid_bot_response');
  const sections=botNodes[0].content.filter(node=>node?.tag==='section');
  if(sections.length!==botNodes[0].content.length)throw Error('invalid_bot_response');
  const allSections=sections.filter(section=>section.attrs?.type==='all');
  if(!allSections.length)throw Error('invalid_bot_response');
  const result=[];
  for(const section of allSections) {
    if(section.content!==undefined&&section.content!==null&&!Array.isArray(section.content))throw Error('invalid_bot_response');
    for(const value of section.content||[]) {
      if(value?.tag!=='bot'||typeof value.attrs?.jid!=='string')throw Error('invalid_bot_response');
      result.push({jid:value.attrs.jid,personaId:value.attrs.persona_id});
    }
  }
  const bots=[];
  for(const value of result) {
    if(!value||typeof value.jid!=='string'||!/^\d{1,40}@(s\.whatsapp\.net|lid|bot)$/.test(value.jid))throw Error('invalid_bot_response');
    const persona=value.personaId;
    if(persona!==undefined&&(typeof persona!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(persona)))throw Error('invalid_bot_response');
    if(bots.length<1000)bots.push({jid:value.jid,persona_id:persona??null});
  }
  return {bots,truncated:result.length>1000,response_verified:true,partial:true,complete:false,limit:1000};
}
export async function checkedBusinessRead(socket,method,args) {
  if(typeof socket.query!=='function')throw new Error('capability_unavailable');
  const catalog=method==='getCatalog';
  if(!catalog && method!=='getCollections')throw new Error('unsupported_read_command');
  const {jid,limit=100,cursor}=catalog?args[0]:{jid:args[0],limit:args[1] || 100};
  const param=(tag,value)=>({tag,attrs:{},content:Buffer.from(String(value))});
  const child=catalog?{tag:'product_catalog',attrs:{jid,allow_shop_source:'true'},content:[param('limit',limit),param('width',100),param('height',100),...(cursor?[{tag:'after',attrs:{},content:cursor}]:[])]}:{tag:'collections',attrs:{biz_jid:jid},content:[param('collection_limit',limit),param('item_limit',limit),param('width',100),param('height',100)]};
  const node=await socket.query({tag:'iq',attrs:{to:'s.whatsapp.net',type:'get',xmlns:'w:biz:catalog',...(!catalog?{smax_id:'35'}:{})},content:[child]},catalog?60000:30000);
  if(node==null)throw new Error('read_timeout');
  const children=Array.isArray(node.content)?node.content:[];
  const providerError=children.find(x=>x?.tag==='error');
  if(node.attrs?.type==='error' || providerError) {
    const raw=providerError?.attrs?.code || node.attrs?.code;
    const code=typeof raw==='string' && /^\d{3}$/.test(raw)?Number(raw):raw;
    throw Object.assign(new Error('provider_query_failed'),{statusCode:Number.isInteger(code) && code>=100 && code<=599?code:undefined});
  }
  if(node.tag!=='iq' || node.attrs?.type!=='result' || !children.some(x=>x?.tag===child.tag && (x.content==null || Array.isArray(x.content))))throw new Error('invalid_business_response');
  const container=children.find(x=>x.tag===child.tag);
  if((container.content || []).some(x=>!(catalog?['product','paging']:['collection']).includes(x?.tag)))throw new Error('invalid_business_response');
  // Internal parser is pinned to the installed Baileys version; only invoke it
  // after verifying the response container, never on an undefined query result.
  const parsers=await import(pathToFileURL(resolve(dirname(requireWorker.resolve('baileys')),'Utils/business.js')).href);
  const parsed=catalog?parsers.parseCatalogNode(node):parsers.parseCollectionsNode(node);
  if((catalog?parsed.products:parsed.collections).some(x=>!x.id))throw new Error('invalid_business_response');
  return parsed;
}
export async function checkedListRead(socket,method) {
  if(typeof socket.query!=='function')throw new Error('capability_unavailable');
  const block=method==='fetchBlocklist';
  const community=method==='communityFetchAllParticipating';
  if(!block && !community && method!=='groupFetchAllParticipating')throw new Error('unsupported_read_command');
  const request=block?{tag:'iq',attrs:{xmlns:'blocklist',to:'s.whatsapp.net',type:'get'}}:{tag:'iq',attrs:{to:'@g.us',xmlns:'w:g2',type:'get'},content:[{tag:'participating',attrs:{},content:[{tag:'participants',attrs:{}},{tag:'description',attrs:{}}]}]};
  const node=await socket.query(request,10000);
  if(node==null)throw new Error('read_timeout');
  const children=Array.isArray(node.content)?node.content:[];
  const errorNode=children.find(x=>x?.tag==='error');
  if(node.attrs?.type==='error' || errorNode) {
    const raw=errorNode?.attrs?.code || node.attrs?.code;
    const code=typeof raw==='string' && /^\d{3}$/.test(raw)?Number(raw):raw;
    throw Object.assign(new Error('provider_query_failed'),{statusCode:Number.isInteger(code) && code>=100 && code<=599?code:undefined});
  }
  const tags=block?['list']:community?['communities','groups']:['groups'];
  const container=children.find(x=>tags.includes(x?.tag));
  if(node.tag!=='iq' || node.attrs?.type!=='result' || !container || (container.content!=null && !Array.isArray(container.content)))throw new Error('invalid_list_response');
  const items=container.content || [];
  const itemTag=block?'item':container.tag==='communities'?'community':'group';
  if(items.some(x=>x?.tag!==itemTag))throw new Error('invalid_list_response');
  if(block)return items.filter(x=>x.tag==='item').map(x=>x.attrs?.jid);
  const useCommunity=container.tag==='communities';
  const baileysModule=await import(pathToFileURL(resolve(dirname(requireWorker.resolve('baileys')),useCommunity?'Socket/communities.js':'Socket/groups.js')).href);
  const output={};
  for(const item of items.filter(x=>x.tag===(useCommunity?'community':'group'))) {
    if(!item.attrs?.id)throw new Error('invalid_list_response');
    const parsed=(useCommunity?baileysModule.extractCommunityMetadata:baileysModule.extractGroupMetadata)({tag:'result',attrs:{},content:[item]});
    // Servers normally return <groups>; group parser's explicit <parent> flag
    // identifies communities without assuming every group is a community.
    if(!community || parsed.isCommunity)output[parsed.id]=parsed;
  }
  return output;
}
function statusSnapshot(rows) {
  return {items:(Array.isArray(rows)?rows:[]).slice(0,20).map(row=>({id:row.id,status:safeFields(row.status,['status','setAt'])}))};
}
function ownScalars(value,keys) {return safeFields(Object.fromEntries(keys.filter(key=>Object.hasOwn(value||{},key)).map(key=>[key,value[key]])),keys);}
function structuredFields(value,strings=[],numbers=[],booleans=[]) {
  const out={};for(const key of strings)if(Object.hasOwn(value||{},key)&&typeof value[key]==='string')out[key]=value[key].slice(0,8192);
  for(const key of numbers)if(Object.hasOwn(value||{},key)&&typeof value[key]==='number'&&Number.isFinite(value[key]))out[key]=value[key];
  for(const key of booleans)if(Object.hasOwn(value||{},key)&&typeof value[key]==='boolean')out[key]=value[key];return out;
}
export function safeOrderDetails(value,observedAt=new Date().toISOString()) {
  const price=value?.price&&typeof value.price==='object'?value.price:{};
  const products=Array.isArray(value?.products)?value.products:[];
  const text=(x,max=200)=>typeof x==='string'?x.slice(0,max):undefined;
  const amount=x=>typeof x==='number'&&Number.isFinite(x)?x:undefined;
  return {source:'baileys_getOrderDetails',available:true,response_verified:true,observed_at:observedAt,items_received:Math.min(products.length,100),truncated:products.length>100,
    price:{...(amount(price.total)!==undefined?{total:amount(price.total)}:{}),...(text(price.currency,20)!==undefined?{currency:text(price.currency,20)}:{})},
    products:products.slice(0,100).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>({...(text(x.id)!==undefined?{id:text(x.id)}:{}),...(text(x.name,500)!==undefined?{name:text(x.name,500)}:{}),...(amount(x.price)!==undefined?{price:amount(x.price)}:{}),...(text(x.currency,20)!==undefined?{currency:text(x.currency,20)}:{}),...(amount(x.quantity)!==undefined?{quantity:amount(x.quantity)}:{}),image_available:typeof x.imageUrl==='string'&&x.imageUrl.length>0}))};
}
export function validOrderDetails(value) {
  if(!value||!Array.isArray(value.products)||value.products.length===0||!value.price||typeof value.price!=='object'||!Number.isFinite(value.price.total)||typeof value.price.currency!=='string'||!value.price.currency.trim())return false;
  return value.products.slice(0,100).every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.id==='string'&&item.id.trim()&&typeof item.name==='string'&&item.name.trim()&&Number.isFinite(item.price)&&Number.isFinite(item.quantity)&&typeof item.currency==='string'&&item.currency.trim());
}
function exactIntegers(value,keys) {
  const output={};for(const key of keys){if(!Object.hasOwn(value||{},key))continue;const input=value[key];let text;
    if(typeof input==='number'){if(!Number.isSafeInteger(input))continue;text=String(input);}
    else if(typeof input==='string'||typeof input==='bigint')text=String(input);
    else if(input&&typeof input.toString==='function'&&Number.isInteger(input.low)&&Number.isInteger(input.high))text=input.toString();
    if(typeof text==='string'&&/^-?\d{1,20}$/.test(text)&&BigInt(text)>=-(1n<<63n)&&BigInt(text)<(1n<<63n))output[key]=text;
  }return output;
}
export function normalizeContent(m) {
  if(!m)return null;
  const bodyText=(...values)=>values.find(value=>typeof value==='string'&&value.length>0)||'';
  const media=['image','audio','document','video','sticker'].find(type=>m[`${type}Message`]);
  if(m.conversation!=null || m.extendedTextMessage) return {type:'text',body:m.conversation || m.extendedTextMessage?.text || '',details:{}};
  if(media) {const value=m[`${media}Message`],details=structuredFields(value,['mimetype','fileName','caption'],['seconds','width','height','pageCount'],['ptt']);return {type:media,body:bodyText(details.caption,details.fileName),details};}
  if(m.locationMessage || m.liveLocationMessage) {const value=m.locationMessage || m.liveLocationMessage,details={...structuredFields(value,['name','address'],['degreesLatitude','degreesLongitude','accuracyInMeters','speedInMps','degreesClockwiseFromMagneticNorth']),location_kind:m.locationMessage?'fixed':'live'};return {type:'location',body:bodyText(details.name,details.address,'Ubicación'),details};}
  if(m.contactMessage || m.contactsArrayMessage) {const raw=m.contactMessage?[m.contactMessage]:m.contactsArrayMessage.contacts;const contacts=(Array.isArray(raw)?raw:[]).slice(0,100).filter(c=>c&&typeof c==='object'&&!Array.isArray(c)).map(c=>structuredFields(c,['displayName','vcard']));return {type:'contact',body:bodyText(contacts.map(c=>c.displayName||'').filter(Boolean).join(', ').slice(0,8192),'Contacto'),details:{contacts}};}
  const poll=m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
  if(poll){const details=structuredFields(poll,['name']);if(Object.hasOwn(poll,'selectableOptionsCount')&&Number.isSafeInteger(poll.selectableOptionsCount)&&poll.selectableOptionsCount>=0)details.selectableOptionsCount=poll.selectableOptionsCount;details.options=(Array.isArray(poll.options)?poll.options:[]).slice(0,100).filter(o=>o&&typeof o==='object'&&!Array.isArray(o)).map(o=>structuredFields(o,['optionName']));return {type:'poll',body:bodyText(details.name,'Encuesta'),details};}
  if(m.reactionMessage)return {type:'reaction',body:m.reactionMessage.text || 'Reacción eliminada',details:{...safeFields(m.reactionMessage,['text','senderTimestampMs']),key:safeFields(m.reactionMessage.key,['id','remoteJid','fromMe','participant'])}};
  if(m.buttonsResponseMessage){const value=m.buttonsResponseMessage,details=structuredFields(value,['selectedButtonId','selectedDisplayText']);if(Object.hasOwn(value,'type')&&[0,1].includes(value.type))details.type=value.type;return {type:'button_reply',body:bodyText(details.selectedDisplayText),details};}
  if(m.listResponseMessage){const value=m.listResponseMessage,details={...structuredFields(value,['title','description']),...structuredFields(value.singleSelectReply,['selectedRowId'])};return {type:'list_reply',body:bodyText(details.title),details};}
  if(m.pollUpdateMessage)return {type:'poll_update',body:'Respuesta a encuesta (contenido cifrado no interpretado)',details:{key:structuredFields(m.pollUpdateMessage.pollCreationMessageKey,['id','remoteJid'],[],['fromMe'])}};
  if(m.productMessage){const value=m.productMessage,p=value.product;const details={...ownScalars(value,['businessOwnerJid','body','footer']),...(p?{product:{...ownScalars(p,['productId','title','description','currencyCode','retailerId','productImageCount']),...exactIntegers(p,['priceAmount1000','salePriceAmount1000'])}}:{}),...(value.catalog?{catalog:ownScalars(value.catalog,['title','description'])}:{})};return {type:'product',body:bodyText(details.body,details.product?.title,details.catalog?.title,'Producto recibido'),details};}
  if(m.orderMessage){const value=m.orderMessage,details={...ownScalars(value,['orderId','itemCount','message','orderTitle','sellerJid','totalCurrencyCode','messageVersion','catalogType']),...exactIntegers(value,['totalAmount1000'])};if(Object.hasOwn(value,'status')&&[1,2,3].includes(value.status))details.status=value.status;if(Object.hasOwn(value,'surface')&&value.surface===1)details.surface=1;return {type:'order',body:bodyText(details.orderTitle,details.message,'Pedido recibido'),details};}
  if(m.eventMessage){const value=m.eventMessage,details={...ownScalars(value,['name','description','isCanceled','extraGuestsAllowed','isScheduleCall','hasReminder']),...exactIntegers(value,['startTime','endTime','reminderOffsetSec'])};if(value.location)details.location=ownScalars(value.location,['name','address','degreesLatitude','degreesLongitude']);return {type:'event',body:bodyText(details.name,'Evento recibido'),details};}
  if(m.eventResponseMessage){const value=m.eventResponseMessage,details=exactIntegers(value,['timestampMs']);if(Object.hasOwn(value,'response')&&[0,1,2,3].includes(value.response))details.response=value.response;if(Object.hasOwn(value,'extraGuestCount')&&Number.isSafeInteger(value.extraGuestCount)&&value.extraGuestCount>=0)details.extraGuestCount=value.extraGuestCount;return {type:'event_response',body:'Respuesta a evento recibida',details};}
  // Protocol and key-distribution envelopes are not user messages and must not leak.
  const unsupported=Object.keys(m).find(k=>k.endsWith('Message') && !['protocolMessage','senderKeyDistributionMessage','messageContextInfo','fastRatchetKeySenderKeyDistributionMessage'].includes(k));
  return unsupported?{type:'unsupported',body:`Contenido disponible: ${unsupported}`,details:{wire_type:unsupported}}:null;
}
function safeMessageStubType(message){const value=message?.messageStubType;return Number.isSafeInteger(value)&&value>=0?value:typeof value==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(value)?value:null;}
export function messageContext(message) {
  const entry=Object.values(message || {}).find(value=>value && typeof value==='object' && value.contextInfo);
  const ctx=entry?.contextInfo;
  if(!ctx)return {};
  const quoted=normalizeContent(ctx.quotedMessage);
  return {quote:{...safeFields(ctx,['stanzaId','participant','remoteJid']),...(quoted?{type:quoted.type,body_preview:quoted.body.slice(0,512)}:{})},mentions:(ctx.mentionedJid || []).filter(x=>typeof x==='string').slice(0,100)};
}

export async function runWorker({ db, baileys, logger, authDir = resolve(root, '.local/baileys-auth'), mediaDir = resolve(root, '.local/media'), readTimeoutMs, catalogCommandTimeoutMs=210000, readIntervalMs = 2000, publicCatalogReaderFactory, avatarCache=cacheAvatar, avatarDir=resolve(root,'.local/avatars') }) {
  if(!Number.isFinite(catalogCommandTimeoutMs)||catalogCommandTimeoutMs<=0||catalogCommandTimeoutMs>900000)throw new Error('invalid_catalog_command_timeout');
  mkdirSync(authDir, {recursive:true, mode:0o700});
  mkdirSync(mediaDir, {recursive:true, mode:0o700});
  const owner = randomUUID();
  let sock = null, starting = false, stopping = false, desired = false;
  let deadline = 0, attempts = 0, nextConnect = 0, lastOpenedAt = 0, processing = false;
  let queue = Promise.resolve();
  let credentialsSaved = Promise.resolve();
  const cache = new Map();
  const receipts = new Map();
  const blocklistInvalidation=createBlocklistInvalidation(db);
  let readBusy = false, lastReadAt = 0, unresolvedRead = null, activeReadCommand = null;
  const connection = () => db.prepare("SELECT * FROM connections WHERE id='wis-5679'").get();
  const owns = () => !stopping && Date.now() < deadline;
  function snapshot(kind, resource, payload) {
    if (!owns() || !resource) return;
    const prior = db.prepare('SELECT payload FROM snapshots WHERE kind=? AND resource_id=?').get(kind,resource);
    let old = {};try { old = JSON.parse(prior?.payload || '{}'); } catch { /* corrupt old snapshot is replaced */ }
    if(kind==='presence'){
      const presences={...(old.presences||{})};let sequence=Math.max(0,...Object.values(presences).map(value=>Number.isSafeInteger(value?.observed_seq)?value.observed_seq:0));
      for(const [jid,value] of Object.entries(payload.presences||{})){delete presences[jid];sequence=Math.max(sequence+1,Date.now()*1000);presences[jid]={...value,observed_seq:sequence};}
      const ordered=Object.entries(presences).sort((a,b)=>(Number(b[1]?.observed_seq)||0)-(Number(a[1]?.observed_seq)||0)||(Date.parse(b[1]?.observed_at)||0)-(Date.parse(a[1]?.observed_at)||0)).slice(0,512);
      payload={...payload,presences:Object.fromEntries(ordered)};
    }
    const now=new Date().toISOString();
    const fresh=payload.available===true?{stale:false,status_code:null,last_attempt_at:now,last_success_at:now}:{};
    const serialized = JSON.stringify({...old,...payload,...fresh});
    if (serialized.length>2*1024*1024) throw new Error('snapshot_too_large');
    db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(kind,resource,serialized,new Date().toISOString());
  }
  function knownAvatarCandidates(current) {
    const ownJids=new Set([current?.user?.id,current?.user?.lid,current?.user?.phoneNumber].filter(value=>typeof value==='string').map(value=>value.replace(/:\d+(?=@)/,'')));
    const rows=db.prepare("SELECT c.wa_jid,a.payload AS avatar_payload FROM contacts c LEFT JOIN snapshots a ON a.kind='avatar' AND a.resource_id=c.wa_jid WHERE c.wa_jid LIKE '%@s.whatsapp.net' OR c.wa_jid LIKE '%@lid' ORDER BY coalesce(a.updated_at,''),c.created_at,c.id LIMIT 10001").all();
    const truncated=rows.length>10000;
    const eligible=rows.slice(0,10000).filter(row=>!ownJids.has(row.wa_jid?.replace(/:\d+(?=@)/,'')) && /^\d+@(s\.whatsapp\.net|lid)$/.test(row.wa_jid||''));
    return {eligible,truncated};
  }
  function updateAvatarCoverage(current,{checkedCount=0,lastReadError=null}={}) {
    const {eligible,truncated}=knownAvatarCandidates(current);let unattempted=0,available=0,failures=0;
    for(const row of eligible){let value={};try{value=JSON.parse(row.avatar_payload||'{}');}catch{}if(!value.last_attempt_at)unattempted++;else if(value.available===true)available++;else failures++;}
    const partial=unattempted>0||failures>0||truncated;
    snapshot('avatars','wis-5679',{available:true,response_verified:true,scope:'known_contacts',known_contact_count:eligible.length,checked_count:checkedCount,unattempted_count:unattempted,available_count:available,failure_count:failures,partial,complete:!partial,candidate_scan_truncated:truncated,last_read_error:lastReadError,error:null,last_attempt_at:new Date().toISOString()});
  }
  function event(kind, resource, payload) {
    if(!owns())return;
    db.prepare('INSERT INTO events(id,kind,resource_id,payload,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),kind,resource || 'wis-5679',JSON.stringify(payload),new Date().toISOString());
    db.prepare('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 1000)').run();
  }
  function saveIdentity(value,source,observedAt=new Date().toISOString()) {
    const lid=typeof value?.lid==='string'?value.lid.replace(/:\d+(?=@)/,''):'';
    const pn=typeof value?.pn==='string'?value.pn.replace(/:\d+(?=@)/,''):'';
    if(!owns()||!/^\d{1,30}@lid$/.test(lid)||!/^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(pn))return;
    let prior={};try{prior=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='identity' AND resource_id=?").get(lid)?.payload || '{}');}catch{}
    const reverse=db.prepare("SELECT resource_id,payload FROM snapshots WHERE kind='identity' AND (json_extract(payload,'$.pn')=? OR EXISTS(SELECT 1 FROM json_each(snapshots.payload,'$.candidate_pns') WHERE value=?)) AND resource_id<>?").all(pn,pn,lid);
    const contact=db.prepare('SELECT phone_e164 FROM contacts WHERE wa_jid=?').get(lid);
    const conflict=Boolean(prior.conflict||(prior.pn&&prior.pn!==pn)||reverse.length||(contact?.phone_e164&&contact.phone_e164!=='+'+pn.split('@')[0]));
    const candidate_pns=[...new Set([...(Array.isArray(prior.candidate_pns)?prior.candidate_pns:[]),prior.pn,prior.conflicting_pn,pn].filter(x=>typeof x==='string'&&/^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(x)))].slice(0,20);
    snapshot('identity',lid,{lid,pn:prior.pn || pn,source,observed_at:observedAt,status:conflict?'conflict':'observed',conflict,candidate_pns,...(conflict?{conflicting_pn:prior.conflicting_pn || (pn!==prior.pn?pn:null)}:{})});
    for(const other of reverse)snapshot('identity',other.resource_id,{status:'conflict',conflict:true,conflict_reason:'pn_multiple_lids'});
    if(conflict)event('identity.conflict',lid,{lid,pn:prior.pn || pn,conflicting_pn:pn,source});
  }
  function saveContacts(contacts) {
    for(const c of contacts.slice(0,10000)) {
      if(!owns() || !c.id)continue;
      saveIdentity({lid:c.lid || (c.id.endsWith('@lid')?c.id:null),pn:c.phoneNumber || (c.id.endsWith('@s.whatsapp.net')?c.id:null)},'contacts');
      const value=safeFields(c,contactKeys);
      if(c.imgUrl!==undefined)value.avatar_available=Boolean(c.imgUrl && c.imgUrl!=='changed');
      snapshot('contact',c.id,value);
      const rawPhone = c.id.endsWith('@s.whatsapp.net')?c.id:null;
      const digits=rawPhone?.split('@')[0]?.split(':')[0]?.replace(/^\+/,'');
      const phone=digits && /^[1-9]\d{7,14}$/.test(digits)?'+'+digits:null;
      const merged=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(c.id).payload);
      const name=merged.name || merged.verifiedName || merged.notify || merged.username;
      const found=db.prepare('SELECT id FROM contacts WHERE wa_jid=?').get(c.id);
      if(found) {
        if(name)db.prepare('UPDATE contacts SET display_name=? WHERE id=?').run(name,found.id);
        // Do not override a different known phone/LID identity or consent record.
      } else db.prepare('INSERT OR IGNORE INTO contacts(id,phone_e164,wa_jid,display_name,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),phone,c.id,name || phone || c.id,new Date().toISOString());
    }
  }
  function saveChats(chats) {
    for(const c of chats.slice(0,10000)) {
      if(!owns() || !c.id || c.id==='status@broadcast')continue;
      snapshot('chat',c.id,safeFields(c,['id','name','displayName','unreadCount','unreadMentionCount','notSpam','archived','pinned','muteEndTime','conversationTimestamp','lastMessageRecvTimestamp','readOnly','ephemeralExpiration','markedAsUnread']));
      const name=c.name || c.displayName || null;
      const contact=db.prepare('SELECT id FROM contacts WHERE wa_jid=?').get(c.id);
      db.prepare('INSERT OR IGNORE INTO conversations(id,contact_id,wa_chat_id,title,display_name,last_message_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),contact?.id || null,c.id,name,name,timestamp(c.conversationTimestamp));
      if(name)db.prepare('UPDATE conversations SET title=?,display_name=? WHERE wa_chat_id=?').run(name,name,c.id);
    }
  }
  function saveGroups(groups) {
    for(const group of groups.slice(0,2000)) {
      if(!owns() || !group.id)continue;
      snapshot('group',group.id,safeGroup(group));
      saveChats([{id:group.id,name:group.subject}]);
    }
  }
  let publicReader,publicReaderJid;
  async function readCall(current, name, args=[]) {
    if(!owns() || sock!==current || connection().status!=='connected')throw new Error('connection_unavailable');
    if(unresolvedRead?.socket===current)throw new Error('previous_read_unresolved');
    const business=['getCatalog','getCollections'].includes(name);
    const publicRead=['publicCatalog','publicCollections'].includes(name);
    const groupRead=['community_subgroups','group_requests','group_invite'].includes(name);
    const communityInviteRead=name==='community_invite';
    const limitsRead=['account_quota','account_timelock'].includes(name);
    const newsletterRead=name==='newsletter_messages';
    const botRead=name==='bot_list';
    const list=['fetchBlocklist','groupFetchAllParticipating','communityFetchAllParticipating'].includes(name);
    if(botRead&&typeof current.query!=='function')throw new Error('capability_unavailable');
    if(!publicRead&&!communityInviteRead&&!botRead&&typeof current[business||list||groupRead||limitsRead||newsletterRead?'query':name]!=='function')throw new Error('capability_unavailable');
    if(communityInviteRead&&typeof current.communityInviteCode!=='function')throw new Error('capability_unavailable');
    let timer,timedOut=false;
    const diagnostic=activeReadCommand?{command_id:activeReadCommand.id,kind:activeReadCommand.kind,method:name}:null;
    const diagnosticResource=activeReadCommand?.target || 'wis-5679';
    try {
      const commandRemaining=Number.isFinite(activeReadCommand?.deadline_at)?activeReadCommand.deadline_at-Date.now():Infinity;
      const callBudget=Math.min(readCallBudgetMs(name,readTimeoutMs),commandRemaining);
      if(callBudget<=0)throw new Error('read_timeout');
      const pending={socket:current};unresolvedRead=pending;
      // Local timeout does not cancel Baileys' IQ request. Block further reads until
      // that request settles (or a different socket takes over), avoiding fan-out.
      const request=Promise.resolve().then(()=>name==='group_invite'?checkedGroupInvite(current,args[0]):communityInviteRead?checkedCommunityInviteCode(current,args[0]):botRead?checkedBotList(current):newsletterRead?checkedNewsletterMessages(current,args[0]):limitsRead?checkedAccountLimits(current,name==='account_quota'?'quota':'timelock'):groupRead?checkedGroupRead(current,name,args[0]):publicRead?publicReader[name==='publicCatalog'?'catalog':'collections'](args[0]):business?checkedBusinessRead(current,name,args):list?checkedListRead(current,name):current[name](...args)).then(value=>{
        if(timedOut && diagnostic && owns() && sock===current)event('read.late_completed',diagnosticResource,{...diagnostic,result:'response_received_after_timeout'});
        return value;
      },error=>{
        if(timedOut && diagnostic && owns() && sock===current) {
          const failure=classifyReadError(error);event('read.late_failed',diagnosticResource,{...diagnostic,error:failure.code,status_code:failure.status_code});
        }
        throw error;
      }).finally(()=>{if(unresolvedRead===pending)unresolvedRead=null;});
      pending.request=request;
      let value;
      try {value=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;const error=new Error('read_timeout');if(business)error.phase=name==='getCatalog'?'baileys_get_catalog':'baileys_get_collections';else if(publicRead)error.phase='public_catalog_read_deadline';reject(error);},callBudget);})]);}
      catch(error){if(business&&error&&typeof error==='object'&&!error.phase)error.phase=name==='getCatalog'?'baileys_get_catalog':'baileys_get_collections';throw error;}
      if(!owns() || sock!==current)throw new Error('connection_changed');
      return value;
    } finally {clearTimeout(timer);}
  }
  async function readAccount(current) {
    snapshot('profile','wis-5679',safeFields(current.user,contactKeys));
    const jid=current.user?.id?.replace(/:\d+(?=@)/,'');
    if(!jid)throw new Error('account_identity_unavailable');
    const results={};
    for(const [kind,method,args] of [['status','fetchStatus',[jid]],['privacy','fetchPrivacySettings',[]],['business','getBusinessProfile',[jid]]]) {
      try {
        const data=await readCall(current,method,args);
        const payload=kind==='status'?statusSnapshot(data):kind==='privacy'?safeFields(data,['last','online','profile','status','readreceipts','groupadd','calladd','messages','defense']):safeFields(data,['wid','address','description','email','category','business_hours']);
        if(kind==='business' && Array.isArray(data?.website))payload.website=data.website.filter(x=>typeof x==='string').slice(0,20);
        if(kind==='business' && data?.business_hours)payload.business_hours={...safeFields(data.business_hours,['timezone']),config:(data.business_hours.config || data.business_hours.business_config || []).slice(0,28).map(x=>safeFields(x,['day_of_week','mode','open_time','close_time']))};
        snapshot(kind,'wis-5679',{...payload,available:data!=null,error:null});results[kind]='done';
      } catch(error) {
        if(!owns() || sock!==current)throw new Error('connection_changed');
        const failure=classifyReadError(error);
        results[kind]='unavailable';snapshot(kind,'wis-5679',{available:false,error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
      }
    }
    return results;
  }
  async function readOwnUsername(current) {
    const ownJids=new Set([current.user?.id,current.user?.lid].filter(value=>typeof value==='string').map(value=>value.replace(/:\d+(?=@)/,'')).filter(value=>/^\d+@(s\.whatsapp\.net|lid)$/.test(value)));
    if(!ownJids.size)throw new Error('account_identity_unavailable');
    const previous=db.prepare("SELECT payload FROM snapshots WHERE kind='account_username' AND resource_id='wis-5679'").get();
    const preservePrevious=()=>{try{const data=previous?JSON.parse(previous.payload):null;return typeof data?.username==='string'?{username:data.username,stale:true}:{};}catch{return {};}};
    try {
      if(typeof baileys.USyncQuery!=='function'||typeof baileys.USyncUser!=='function'||typeof current.executeUSyncQuery!=='function')throw new Error('capability_unavailable');
      const query=new baileys.USyncQuery();
      for(const jid of ownJids)query.withUser(new baileys.USyncUser().withId(jid));
      query.withUsernameProtocol();
      const result=await readCall(current,'executeUSyncQuery',[query]);
      const matches=Array.isArray(result?.list)?result.list.filter(value=>value&&typeof value.id==='string'&&ownJids.has(value.id.replace(/:\d+(?=@)/,''))):[];
      const usernames=[...new Set(matches.map(value=>value.username).filter(value=>typeof value==='string'&&value.length>0&&value.length<=128))];
      const username=usernames.length===1?usernames[0]:null;
      snapshot('account_username','wis-5679',username?{available:true,response_verified:true,username,source:'usync_username_protocol',error:null}:{available:false,response_verified:false,...preservePrevious(),source:'usync_username_protocol',error:'no_exact_username_reply'});
      return {available:Boolean(username)};
    } catch(error) {
      if(!owns()||sock!==current)throw new Error('connection_changed');
      const failure=classifyReadError(error);
      snapshot('account_username','wis-5679',{available:false,response_verified:false,...preservePrevious(),source:'usync_username_protocol',error:failure.code,status_code:failure.status_code??null});
      throw error;
    }
  }
  async function readContactProfile(current,target) {
    const observedAt=new Date().toISOString(),data={profile_read_at:observedAt};let previous={};try{previous=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(target)?.payload||'{}');}catch{}
    let successfulReads=0,verifiedReads=0,firstFailure=null;
    const failedSection=(key,error)=>{const failure=typeof error==='string'?{code:error}:classifyReadError(error),prior=previous[key];firstFailure??=failure;data[key]=prior?.response_verified===true?{...prior,stale:true,last_attempt_at:observedAt,last_error:failure.code}:{available:false,response_verified:false,stale:false,last_attempt_at:observedAt,error:failure.code,status_code:failure.status_code};};
    try{
      const statuses=await readCall(current,'fetchStatus',[target]);successfulReads++;
      const match=Array.isArray(statuses)?statuses.find(item=>item?.id===target):null;
      if(match){verifiedReads++;const fields=safeFields(match.status,['status','setAt']);data.status={available:Object.keys(fields).length>0,response_verified:true,stale:false,last_attempt_at:observedAt,last_error:null,available_fields:{status:typeof fields.status==='string',setAt:Object.hasOwn(fields,'setAt')},...fields,...(Object.keys(fields).length?{}:{error:'status_fields_not_returned'})};}
      else failedSection('status','no_exact_status_reply');
    }catch(error){failedSection('status',error);}
    if(target.endsWith('@s.whatsapp.net'))try{
      const profile=await readCall(current,'getBusinessProfile',[target]);successfulReads++;
      if(profile&&typeof profile==='object'&&profile.wid===target){verifiedReads++;const business={wid:target},available_fields={wid:true};for(const key of ['address','description','email','category']){const value=profile[key];available_fields[key]=typeof value==='string'&&value.length>0&&value.length<=8192;if(available_fields[key])business[key]=value;}const websites=Array.isArray(profile.website)?profile.website.filter(value=>typeof value==='string'&&value.length>0&&value.length<=2048).slice(0,20):[];available_fields.website=websites.length>0;if(available_fields.website)business.website=websites;const hours=profile.business_hours,config=Array.isArray(hours?.business_config||hours?.config)?(hours.business_config||hours.config).filter(value=>value&&typeof value==='object').slice(0,28).map(value=>safeFields(value,['day_of_week','mode','open_time','close_time'])):[],timezone=typeof hours?.timezone==='string'&&hours.timezone.length<=100?hours.timezone:undefined;available_fields.business_hours=config.length>0||Boolean(timezone);if(available_fields.business_hours)business.business_hours={...(timezone?{timezone}:{}),...(config.length?{config}:{})};data.business_profile={available:true,response_verified:true,stale:false,last_attempt_at:observedAt,last_error:null,available_fields,...business};}
      else failedSection('business_profile','no_exact_business_profile_reply');
    }catch(error){failedSection('business_profile',error);}
    else failedSection('business_profile','business_profile_requires_phone_jid');
    snapshot('contact',target,data);
    return {successfulReads,verifiedReads,firstFailure};
  }
  async function drainReads() {
    if(readBusy || !owns() || !sock || unresolvedRead?.socket===sock || connection().status!=='connected' || Date.now()-lastReadAt<readIntervalMs)return;
    const command=db.prepare("SELECT * FROM read_commands WHERE status='pending' ORDER BY created_at LIMIT 1").get();
    if(!command)return;
    readBusy=true;lastReadAt=Date.now();activeReadCommand=command.kind==='catalog'?{...command,deadline_at:Date.now()+catalogCommandTimeoutMs}:command;
    const current=sock;
    let attemptScope=null;
    db.prepare("UPDATE read_commands SET status='running',error=NULL,updated_at=? WHERE id=? AND status='pending'").run(new Date().toISOString(),command.id);
    try {
      if(command.kind==='account' || command.kind==='all')await readAccount(current);
      if(command.kind==='account_username')await readOwnUsername(current);
      if(command.kind==='groups' || command.kind==='all') {
        const groups=await readCall(current,'groupFetchAllParticipating');
        saveGroups(Object.values(groups || {}));
        snapshot('groups','wis-5679',{available:true,response_verified:true,count:Object.keys(groups || {}).length,truncated:Object.keys(groups || {}).length>2000,error:null});
      } else if(command.kind==='group') {
        if(!/^\d+(?:-\d+)?@g\.us$/.test(command.target || ''))throw new Error('invalid_target');
        saveGroups([await readCall(current,'groupMetadata',[command.target])]);
      } else if(command.kind==='contact_check') {
        const contact=db.prepare('SELECT id,phone_e164 FROM contacts WHERE id=?').get(command.target);
        if(!contact||!/^\+[1-9]\d{6,14}$/.test(contact.phone_e164||''))throw new Error('known_contact_phone_required');
        const results=await readCall(current,'onWhatsApp',[contact.phone_e164]);
        if(!Array.isArray(results))throw new Error('contact_check_unavailable');
        const expected=contact.phone_e164.slice(1),match=results.length===1&&results[0]&&typeof results[0]==='object'&&new RegExp('^'+expected+'(?::\\d+)?@s\\.whatsapp\\.net$').test(results[0].jid||'')?results[0]:null;
        const checkedAt=new Date().toISOString();
        if(match&&match.exists===true)snapshot('contact_check',contact.id,{available:true,response_verified:true,status:'registered',exists:true,provider_jid:match.jid,checked_at:checkedAt,error:null});
        else if(match&&match.exists===false)snapshot('contact_check',contact.id,{available:true,response_verified:true,status:'not_registered',exists:false,provider_jid:match.jid,checked_at:checkedAt,error:null});
        else snapshot('contact_check',contact.id,{available:true,response_verified:false,status:'unknown',exists:null,provider_jid:null,checked_at:checkedAt,error:'no_exact_match_returned'});
      } else if(command.kind==='contact_profile') {
        if(!/^\d+@(s\.whatsapp\.net|lid)$/.test(command.target || '')||!db.prepare('SELECT 1 FROM contacts WHERE wa_jid=?').get(command.target))throw new Error('invalid_target');
        const result=await readContactProfile(current,command.target);if(!result.successfulReads&&result.firstFailure)throw new Error(result.firstFailure.code);
      } else if(command.kind==='contact_profiles') {
        if(command.target)throw new Error('invalid_target');
        const own=current.user?.id?.replace(/:\d+(?=@)/,'');
        const candidates=db.prepare("SELECT c.wa_jid FROM contacts c LEFT JOIN snapshots s ON s.kind='contact' AND s.resource_id=c.wa_jid WHERE c.wa_jid LIKE '%@s.whatsapp.net' OR c.wa_jid LIKE '%@lid' ORDER BY coalesce(json_extract(s.payload,'$.profile_read_at'),'') ASC,c.created_at ASC,c.id ASC LIMIT 10000").all();
        const targets=candidates.filter(row=>row.wa_jid!==own&&/^\d+@(s\.whatsapp\.net|lid)$/.test(row.wa_jid||'')).slice(0,3),candidateScanTruncated=candidates.length===10000;
        let checked=0,verified=0,failures=0,firstFailure=null;
        for(const row of targets){
          try{const result=await readContactProfile(current,row.wa_jid);checked++;verified+=result.verifiedReads;if(!result.verifiedReads||result.firstFailure){failures++;firstFailure??=result.firstFailure;}}
          catch(error){const failure=classifyReadError(error);checked++;failures++;firstFailure??=failure;}
          if(unresolvedRead?.socket===current)break;
        }
         snapshot('contact_profiles','wis-5679',{available:verified>0,response_verified:verified>0,scope:'known_contacts',batch_size:3,checked_count:checked,verified_read_count:verified,failure_count:failures,partial:candidateScanTruncated||failures>0||checked<targets.length,complete:targets.length===0&&!candidateScanTruncated,error:checked>0&&verified===0?firstFailure?.code??'no_exact_profile_reply':null});
        if(checked>0&&verified===0&&firstFailure)throw new Error(firstFailure.code);
      } else if(command.kind==='history') {
        const chat=db.prepare('SELECT id FROM conversations WHERE wa_chat_id=?').get(command.target);
        if(!chat || !/^\d+(?:-\d+)?@(s\.whatsapp\.net|lid|g\.us)$/.test(command.target || ''))throw new Error('invalid_target');
        const oldest=db.prepare("SELECT wa_message_id,direction,created_at FROM messages WHERE conversation_id=? AND wa_message_id IS NOT NULL AND wa_message_id!='' AND direction IN ('in','out') ORDER BY created_at ASC LIMIT 1").get(chat.id);
        const millis=Date.parse(oldest?.created_at);
        if(!oldest || !Number.isFinite(millis) || millis<=0)throw new Error('invalid_target');
        snapshot('history_request',command.id,{target:command.target,conversation_id:chat.id,status:'requesting',requested_count:LOCAL_LIMITS.history_request_messages,oldest_message_id:oldest.wa_message_id,oldest_timestamp:oldest.created_at,requested_at:new Date().toISOString(),complete:false});
        // Installed Baileys copies the argument to oldestMsgTimestampMs, so use
        // milliseconds. This is a peer history request, never a chat send/read receipt.
        const requestId=await readCall(current,'fetchMessageHistory',[LOCAL_LIMITS.history_request_messages,{remoteJid:command.target,id:oldest.wa_message_id,fromMe:oldest.direction==='out'},millis]);
        if(typeof requestId!=='string' || !requestId)throw new Error('invalid_history_response');
        snapshot('history_request',command.id,{request_id:requestId,status:'requested',request_accepted_at:new Date().toISOString(),complete:false});
        event('history.requested',command.target,{command_id:command.id,request_id:requestId,requested_count:LOCAL_LIMITS.history_request_messages,complete:false});
      } else if(command.kind==='bot_list') {
        if(command.target)throw Error('invalid_target');
        const result=await readCall(current,'bot_list');
        snapshot('bot_list','wis-5679',{...result,available:true,response_verified:true,error:null,source:'checked_baileys_bot_v2_iq'});
      } else if(command.kind==='newsletter_messages') {
        if(!/^\d{1,40}@newsletter$/.test(command.target||'')||!db.prepare("SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind='newsletter' AND resource_id=? LIMIT 1").get(command.target,command.target))throw Error('unknown_newsletter');
        const result=await readCall(current,'newsletter_messages',[command.target]);
        snapshot('newsletter_messages',command.target,{...result,available:true,response_verified:true,error:null,source:'checked_newsletter_iq'});
      } else if(command.kind==='disappearing_mode') {
        let target=command.target;
        if(!target){
          const ownJids=new Set([current?.user?.id,current?.user?.lid,current?.user?.phoneNumber].filter(value=>typeof value==='string').map(value=>value.replace(/:\d+(?=@)/,'')));
          const candidates=db.prepare("SELECT c.wa_chat_id AS target FROM conversations c LEFT JOIN snapshots s ON s.kind='disappearing_mode' AND s.resource_id=c.wa_chat_id WHERE c.wa_chat_id IS NOT NULL ORDER BY coalesce(s.updated_at,''),c.wa_chat_id LIMIT 2000").all();
          target=candidates.find(row=>isKnownChatJid(row.target)&&!ownJids.has(row.target.replace(/:\d+(?=@)/,'')))?.target;
          if(!target)throw new Error('no_known_chat');
          const assigned=db.prepare("UPDATE read_commands SET target=?,updated_at=? WHERE id=? AND status='running' AND target IS NULL").run(target,new Date().toISOString(),command.id);
          if(assigned.changes!==1)throw new Error('scheduled_target_assignment_failed');
          command.target=target;
        }
        if(!isKnownChatJid(target)||!db.prepare('SELECT 1 FROM conversations WHERE wa_chat_id=? LIMIT 1').get(target))throw new Error('invalid_target');
        const result=await readCall(current,'fetchDisappearingDuration',[target]);
        const data=normalizeDisappearingModeReply(result,target,new Date().toISOString());
        if(!owns()||sock!==current)throw new Error('connection_changed');
        snapshot('disappearing_mode',target,data);
      } else if(command.kind==='account_limits') {
        const data={};
        for(const kind of ['quota','timelock']){try{data[kind]=await readCall(current,'account_'+kind);}catch(error){const failure=classifyReadError(error);data[kind]={available:false,response_verified:false,error:failure.code,status_code:failure.status_code};}}
        if(!owns()||sock!==current)throw Error('connection_changed');
        const prior=db.prepare("SELECT payload FROM snapshots WHERE kind='account_limits' AND resource_id='wis-5679'").get();
        let old={};try{old=JSON.parse(prior?.payload||'{}');}catch{}
        snapshot('account_limits','wis-5679',mergeAccountLimitsSnapshot(old,data,new Date().toISOString()));
      } else if(command.kind==='group_invite') {
        if(!/^\d+(?:-\d+)?@g\.us$/.test(command.target||'')||!db.prepare("SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind IN ('group','community') AND resource_id=? LIMIT 1").get(command.target,command.target))throw Error('invalid_target');
        const code=await readCall(current,'group_invite',[command.target]);
        snapshot('group_invite',command.target,{code,expires_at:new Date(Date.now()+300000).toISOString(),available:true,response_verified:true,expired:false,stale:false,error:null,status_code:null});
      } else if(command.kind==='community_invite') {
        if(!/^\d+(?:-\d+)?@g\.us$/.test(command.target||'')||!db.prepare("SELECT 1 FROM snapshots WHERE resource_id=? AND (kind='community' OR (kind='group' AND json_extract(payload,'$.isCommunity')=1)) LIMIT 1").get(command.target))throw Error('invalid_target');
        const code=await readCall(current,'community_invite',[command.target]);
        snapshot('community_invite',command.target,{code,expires_at:new Date(Date.now()+300000).toISOString(),available:true,response_verified:true,expired:false,stale:false,error:null,status_code:null});
      } else if(command.kind==='order_details') {
        if(typeof command.target!=='string'||command.target.length>200)throw Error('invalid_order_message');
        const prior=db.prepare("SELECT m.wa_message_id,m.type,m.body,m.conversation_id,c.wa_chat_id FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE m.wa_message_id=?").get(command.target),previous=db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id=?").get(command.target);
        const observed=JSON.parse(previous?.payload||'{}');if(!prior||prior.type!=='order'||!prior.wa_chat_id||observed.type!=='order'||observed.revoked||observed.edited||observed.deleted||prior.body===null)throw Error('order_message_unavailable');
        const wire=cache.get(command.target),content=wire?.ephemeralMessage?.message||wire?.documentWithCaptionMessage?.message||wire,order=content?.orderMessage;
        if(!order||typeof order.orderId!=='string'||!/^[-\w.]{1,200}$/.test(order.orderId)||typeof order.token!=='string'||!/^[A-Za-z0-9+/=_-]{1,8192}$/.test(order.token))throw Error('order_credential_unavailable');
        const details=await readCall(current,'getOrderDetails',[order.orderId,order.token]);
        if(!validOrderDetails(details))throw Error('invalid_order_details_response');
        const latest=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id=?").get(command.target)?.payload||'{}');
        const stillKnown=db.prepare("SELECT 1 FROM messages WHERE wa_message_id=? AND type='order' AND body IS NOT NULL").get(command.target);
        if(!stillKnown||latest.type!=='order'||latest.revoked||latest.edited||latest.deleted)throw Error('order_message_unavailable');
        snapshot('order_details',command.target,{message_id:command.target,...safeOrderDetails(details)});
      } else if(['community_subgroups','group_requests'].includes(command.kind)) {
        let target=command.target;
        if(command.kind==='group_requests'&&!target){const candidates=db.prepare("SELECT g.resource_id FROM (SELECT wa_chat_id AS resource_id FROM conversations WHERE wa_chat_id LIKE '%@g.us' UNION SELECT resource_id FROM snapshots WHERE kind='group') g LEFT JOIN snapshots r ON r.kind='group_requests' AND r.resource_id=g.resource_id WHERE g.resource_id LIKE '%@g.us' ORDER BY coalesce(r.updated_at,''),g.resource_id LIMIT 100").all();target=candidates.find(row=>/^\d+(?:-\d+)?@g\.us$/.test(row.resource_id||''))?.resource_id;}
        if(!/^\d+(?:-\d+)?@g\.us$/.test(target || '') || !db.prepare("SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind IN ('group','community') AND resource_id=? LIMIT 1").get(target,target))throw Error('invalid_target');
        if(command.kind==='community_subgroups'&&!db.prepare("SELECT 1 FROM snapshots WHERE resource_id=? AND (kind='community' OR (kind='group' AND json_extract(payload,'$.isCommunity')=1)) LIMIT 1").get(target))throw Error('unknown_community');
        if(command.target!==target){command.target=target;db.prepare('UPDATE read_commands SET target=?,updated_at=? WHERE id=?').run(target,new Date().toISOString(),command.id);}
        let approvalMode;
        if(command.kind==='group_requests') {
          const metadata=db.prepare("SELECT payload FROM snapshots WHERE kind='group' AND resource_id=?").get(target);
          try { approvalMode=JSON.parse(metadata?.payload||'{}').joinApprovalMode; } catch { /* Unknown metadata keeps the normal read path. */ }
        }
        if(command.kind==='group_requests'&&approvalMode===false) {
          snapshot('group_requests',target,{requests:[],available:false,response_verified:false,stale:false,skipped:true,skip_reason:'approval_not_enabled',error:null,status_code:null,source:'group_metadata',last_attempt_at:new Date().toISOString()});
        } else {
          if(command.kind==='group_requests')snapshot('group_requests',target,{skipped:false,skip_reason:null});
          const result=await readCall(current,command.kind,[target]);
          snapshot(command.kind,target,{[command.kind==='group_requests'?'requests':'groups']:result.rows,available:true,response_verified:true,truncated:result.truncated,error:null,source:'checked_baileys_iq'});
        }
      } else if(command.kind==='avatar'||command.kind==='avatars') {
        let target=command.target;
        if(command.kind==='avatars') {
          if(target)throw Error('invalid_target');
          target=knownAvatarCandidates(current).eligible[0]?.wa_jid;
          if(target){command.target=target;db.prepare('UPDATE read_commands SET target=?,updated_at=? WHERE id=?').run(target,new Date().toISOString(),command.id);}
        }
        if(!target&&command.kind==='avatars')updateAvatarCoverage(current);
        else if(!target)throw Error('invalid_target');
        else {
        const own=current.user?.id?.replace(/:\d+(?=@)/,'');
        if(!/^\d+(?:-\d+)?@(s\.whatsapp\.net|lid|g\.us)$/.test(target || '') || (target!==own && !db.prepare("SELECT 1 FROM contacts WHERE wa_jid=? OR replace(phone_e164,'+','')||'@s.whatsapp.net'=? UNION SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind='group' AND resource_id=? LIMIT 1").get(target,target,target,target)))throw Error('invalid_target');
        const remote=await readCall(current,'profilePictureUrl',[target,'preview',10000]);
        if(typeof remote!=='string'||!remote)throw Error('avatar_unavailable');
        const value=await avatarCache(remote,{directory:avatarDir,authorized:()=>owns()&&sock===current&&!stopping});
        if(!owns()||sock!==current)throw Error('connection_changed');
        snapshot('avatar',target,{...value,available:true,stale:false,error:null,scope:'profile_picture',last_attempt_at:new Date().toISOString()});
        if(command.kind==='avatars')updateAvatarCoverage(current,{checkedCount:1});
        }
      } else if(['catalog','collections','contact_catalog'].includes(command.kind)) {
        const contactCatalog=command.kind==='contact_catalog';
        const jid=contactCatalog?command.target:current.user?.id?.replace(/:\d+(?=@)/,'');
        if(contactCatalog&&(!/^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(jid||'')||!db.prepare("SELECT 1 FROM contacts WHERE wa_jid=? OR phone_e164=? LIMIT 1").get(jid,'+'+jid.split('@')[0])))throw Error('invalid_target');
        if(!jid)throw new Error('account_identity_unavailable');
        const publicScope=!contactCatalog&&Boolean(publicCatalogReaderFactory);
        if(publicScope && (!publicReader || publicReaderJid!==jid)){publicReader=publicCatalogReaderFactory({ownJid:jid});publicReaderJid=jid;}
        let scope=contactCatalog?{scope:'contact_catalog',known_only:true,source:'checked_baileys_iq'}:publicScope?{scope:'public_catalog',known_only:true,source:'public_whatsapp_graphql'}:{};
        attemptScope=scope;
        if(command.kind!=='collections') {
          const products=new Map();const seenCursors=new Set();let cursor,pages=0,partial=false,usePublicCatalog=publicScope;
          const previousCatalog=db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id=?").get(jid);
          let previousScope='observed_catalog';try{previousScope=JSON.parse(previousCatalog?.payload||'{}').scope||previousScope;}catch{}
          let fallbackFailure=null;
          do {
            let page;
            if(usePublicCatalog){try{page=await readCall(current,'publicCatalog',[{after:cursor || null}]);}catch(error){if(!canFallbackPublicCatalog(error))throw error;fallbackFailure=classifyReadError(error);if(pages){products.clear();seenCursors.clear();cursor=undefined;pages=0;partial=false;}usePublicCatalog=false;scope={scope:'own_account',known_only:false,source:'checked_baileys_iq_fallback',fallback_reason:fallbackFailure.code,fallback_phase:fallbackFailure.phase??'public_catalog_query'};attemptScope=scope;}}
            if(!page)page=await readCall(current,'getCatalog',[{jid,limit:100,...(cursor?{cursor}:{})}]);
            if(!Array.isArray(page?.products))throw new Error('invalid_catalog_response');
            partial ||= Boolean(page.truncated);
            for(const p of page.products.slice(0,100)){const value=safeProduct(p);if(value.id!==undefined && value.id!==null)products.set(String(value.id),value);}
            cursor=usePublicCatalog?(page.paging?.after || undefined):(typeof page.nextPageCursor==='string'?page.nextPageCursor:undefined);pages++;
            if(cursor && seenCursors.has(cursor))break;
            if(cursor)seenCursors.add(cursor);
          } while(cursor && pages<3);
          // Replace the previous complete collection only when this read is complete.
          db.exec('BEGIN IMMEDIATE');
          try {
            if(previousScope!==scope.scope || (!cursor && !partial))db.prepare("DELETE FROM snapshots WHERE kind='product' AND resource_id LIKE ?").run(jid+':%');
            for(const [id,value] of products)snapshot('product',jid+':'+id,{...value,owner_jid:jid,scope:scope.scope??'own_account',available:true});
            snapshot('catalog',jid,{available:true,response_verified:true,product_count:products.size,has_more:Boolean(cursor),truncated:Boolean(cursor)||partial,pages,source:scope.source??'getCatalog',...scope,last_attempt_scope:scope.scope??'own_account',last_attempt_source:scope.source??'getCatalog',last_attempt_phase:usePublicCatalog?'public_catalog_query':'baileys_get_catalog',fallback_reason:fallbackFailure?.code??null,fallback_phase:fallbackFailure?(fallbackFailure.phase??'public_catalog_query'):null,error:null,provider_code:null,status_code:null});
            if(!owns() || sock!==current)throw new Error('connection_changed');
            db.exec('COMMIT');
          } catch(error) {try{db.exec('ROLLBACK');}catch{}throw error;}
        } else {
          const previousCollections=db.prepare("SELECT payload FROM snapshots WHERE kind='collections' AND resource_id=?").get(jid);
          let previousCollectionScope='observed_collections';try{previousCollectionScope=JSON.parse(previousCollections?.payload||'{}').scope||previousCollectionScope;}catch{}
          let result;
          if(publicScope) {
            try { result=await readCall(current,'publicCollections',[{}]); }
            catch(error) {
              if(!canFallbackPublicCatalog(error))throw error;
              const fallbackFailure=classifyReadError(error);
              scope={scope:'own_account',known_only:false,source:'checked_baileys_iq_fallback',fallback_reason:fallbackFailure.code,fallback_phase:fallbackFailure.phase??'public_collections_query'};
              attemptScope=scope;
              result=await readCall(current,'getCollections',[jid,100]);
            }
          } else result=await readCall(current,'getCollections',[jid,100]);
          if(!Array.isArray(result?.collections))throw new Error('invalid_collections_response');
          const collectionScope=scope.scope??'own_account',publicCollectionScope=collectionScope==='public_catalog',limit=publicCollectionScope?50:100;
          const truncated=Boolean(result.truncated)||Boolean(result.paging?.after)||result.collections.length>(publicCollectionScope?50:99);
          const complete=!truncated&&result.collections.length<limit;
          db.exec('BEGIN IMMEDIATE');
          try {
            if(previousCollectionScope!==collectionScope||complete)db.prepare("DELETE FROM snapshots WHERE kind='collection' AND resource_id LIKE ?").run(jid+':%');
            for(const c of result.collections.slice(0,limit))if(c.id!==undefined && c.id!==null)snapshot('collection',jid+':'+c.id,{...safeFields(c,['id','name','products_truncated','products_collected']),owner_jid:jid,...scope,status:safeFields(c.status,['status','canAppeal']),products:(c.products || []).slice(0,100).map(safeProduct),available:true});
            snapshot('collections',jid,{available:true,response_verified:true,collection_count:Math.min(result.collections.length,limit),truncated,source:scope.source??'getCollections',...scope,last_attempt_scope:collectionScope,last_attempt_source:scope.source??'getCollections',last_attempt_phase:publicCollectionScope?'public_collections_query':'baileys_get_collections',fallback_reason:scope.fallback_reason??null,fallback_phase:scope.fallback_phase??null,error:null,provider_code:null,status_code:null});
            if(!owns() || sock!==current)throw new Error('connection_changed');
            db.exec('COMMIT');
          } catch(error) {try{db.exec('ROLLBACK');}catch{}throw error;}
        }
      } else if(command.kind==='blocklist') {
        const revision=blocklistInvalidation.revision;
        const values=await readCall(current,'fetchBlocklist');
        if(!Array.isArray(values))throw new Error('invalid_blocklist_response');
        const ids=values.filter(x=>typeof x==='string' && /^\d+@(s\.whatsapp\.net|lid)$/.test(x));
        if(revision!==blocklistInvalidation.revision)snapshot('blocklist','wis-5679',{available:false,response_verified:false,stale:true,stale_reason:'change_during_read',last_attempt_at:new Date().toISOString(),error:null});
        else snapshot('blocklist','wis-5679',{response_verified:true,ids:ids.slice(0,10000),count:ids.length,truncated:ids.length>10000,available:true,error:null,stale_reason:null});
      } else if(command.kind==='communities' || command.kind==='community') {
        if(command.kind==='communities') {
          const groups=await readCall(current,'communityFetchAllParticipating');
          if(!groups || typeof groups!=='object' || Array.isArray(groups))throw new Error('invalid_communities_response');
          const values=Object.values(groups);
          if(values.some(x=>!x || typeof x.id!=='string'))throw new Error('invalid_communities_response');
          const list=values.filter(x=>x.isCommunity);
          db.exec('BEGIN IMMEDIATE');
          try {
            if(list.length<=2000)db.prepare("DELETE FROM snapshots WHERE kind='community'").run();
            for(const group of list.slice(0,2000)){snapshot('community',group.id,{...safeGroup(group),available:true});saveGroups([group]);}
            snapshot('communities','wis-5679',{available:true,response_verified:true,count:list.length,truncated:list.length>2000,error:null});
            if(!owns() || sock!==current)throw new Error('connection_changed');
            db.exec('COMMIT');
          } catch(error) {db.exec('ROLLBACK');throw error;}
        } else {
          if(!/^\d+(?:-\d+)?@g\.us$/.test(command.target || '') || !db.prepare("SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind IN ('group','community') AND resource_id=? LIMIT 1").get(command.target,command.target))throw new Error('unknown_community');
          const group=await readCall(current,'communityMetadata',[command.target]);
          if(!group || typeof group!=='object' || Array.isArray(group) || group.id!==command.target)throw new Error('invalid_community_metadata_response');
          const parent=group?.linkedParent??(group?.isCommunity===true?command.target:null);
          if(typeof parent!=='string'||!/^[0-9]+(?:-[0-9]+)?@g\.us$/.test(parent))throw new Error('invalid_community_metadata_response');
          const linked=await readCall(current,'community_subgroups',[parent]);
          snapshot('community',command.target,{...safeGroup(group),community_jid:parent,...(typeof group.isCommunity==='boolean'?{is_community:group.isCommunity}:{}),linked_groups:linked.rows,linked_groups_truncated:linked.truncated,response_verified:true,available:true,error:null});
          saveGroups([group]);
        }
      } else if(command.kind==='newsletter' || command.kind==='newsletters') {
        const selection=command.kind==='newsletter'?{targets:[command.target],truncated:false}:selectKnownNewsletterTargets(db);
        const targets=selection.targets;
        let count=0,attempted=0,failures=0,firstFailure=null,firstError=null;
        for(const id of targets) {
          if(!/^\d+@newsletter$/.test(id || '') || !db.prepare("SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind='newsletter' AND resource_id=? LIMIT 1").get(id,id))throw new Error('unknown_newsletter');
          attempted++;
          try{const value=await readCall(current,'newsletterMetadata',['jid',id]);if(!value||typeof value!=='object'||value.id!==id)throw new Error('invalid_newsletter_metadata_response');snapshot('newsletter',id,{...safeNewsletter(value),available:true,response_verified:true,error:null});count++;}
          catch(error){if(!owns()||sock!==current)throw new Error('connection_changed');const failure=classifyReadError(error);firstFailure??=failure;firstError??=error;failures++;const prior=db.prepare("SELECT 1 FROM snapshots WHERE kind='newsletter' AND resource_id=?").get(id);snapshot('newsletter',id,{available:false,response_verified:false,stale:Boolean(prior),error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});if(command.kind==='newsletter')throw error;if(unresolvedRead?.socket===current)break;}
        }
        if(command.kind==='newsletters'){const truncated=selection.truncated,unattempted=targets.length-attempted,partial=targets.length===0||truncated||failures>0||unattempted>0;snapshot('newsletters','wis-5679',{available:count>0||targets.length===0,response_verified:count>0,count,attempted_count:attempted,failure_count:failures,unattempted_count:unattempted,known_only:true,truncated,partial,complete:!partial,error:count===0&&failures>0?firstFailure?.code:null,source:'known_local_channels'});if(count===0&&failures>0)throw firstError||new Error('read_failed');}
      } else if(command.kind==='newsletter_counts') {
        const target=command.target;
        if(!/^\d{1,40}@newsletter$/.test(target||'')||!db.prepare("SELECT 1 FROM conversations WHERE wa_chat_id=? UNION SELECT 1 FROM snapshots WHERE kind='newsletter' AND resource_id=? LIMIT 1").get(target,target))throw new Error('unknown_newsletter');
        const prior=db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter_counts' AND resource_id=?").get(target);let previous={};try{previous=JSON.parse(prior?.payload||'{}');}catch{}
        const fields={...(previous.fields||{})},metrics=[['subscribers','newsletterSubscribers'],['admin_count','newsletterAdminCount']];let successes=0,firstError=null;
        const staleField=key=>{const old=fields[key];fields[key]={available:false,response_verified:false,stale:Boolean(old?.available||old?.stale),...(Number.isSafeInteger(old?.value)&&old.value>=0?{value:old.value}:{value:null}),error:'read_pending',observed_at:old?.observed_at??null};};
        for(let index=0;index<metrics.length;index++){
          const [key,method]=metrics[index];
          try {
            const response=await readCall(current,method,[target]);
            const value=key==='subscribers'?response?.subscribers:response;
            if(!Number.isSafeInteger(value)||value<0)throw new Error('invalid_newsletter_count_response');
            fields[key]={available:true,response_verified:true,stale:false,value,observed_at:new Date().toISOString(),error:null};successes++;
          } catch(error) {
            if(!owns()||sock!==current)throw new Error('connection_changed');
            const failure=classifyReadError(error);firstError??=error;
            const old=fields[key];fields[key]={available:false,response_verified:false,stale:Boolean(old?.available||old?.stale),...(Number.isSafeInteger(old?.value)&&old.value>=0?{value:old.value}:{value:null}),error:failure.code,observed_at:old?.observed_at??null};
            if(unresolvedRead?.socket===current){for(const [pendingKey] of metrics.slice(index+1))staleField(pendingKey);break;}
          }
        }
        snapshot('newsletter_counts',target,{available:successes>0,response_verified:successes===2,partial:successes!==2,fields,source:'baileys_read_only_aggregate',error:successes===0?classifyReadError(firstError||new Error('read_failed')).code:null});
        if(successes===0)throw firstError||new Error('read_failed');
      } else if(!['account','all','account_username'].includes(command.kind))throw new Error('unsupported_read_command');
      if(!owns() || sock!==current)throw new Error('connection_changed');
      db.prepare("UPDATE read_commands SET status='done',updated_at=? WHERE id=?").run(new Date().toISOString(),command.id);
      event('read.completed',command.target || 'wis-5679',{kind:command.kind,command_id:command.id,...(command.kind==='history'?{result:'request_accepted',complete:false}:{})});
    } catch(error) {
      if(owns()) {
        const failure=classifyReadError(error);
        db.prepare("UPDATE read_commands SET status='failed',error=?,updated_at=? WHERE id=?").run(failure.code,new Date().toISOString(),command.id);
         if(command.kind==='contact_check')snapshot('contact_check',command.target,{available:false,response_verified:false,status:'unknown',exists:null,provider_jid:null,checked_at:new Date().toISOString(),error:failure.code,status_code:failure.status_code});
        if(command.kind==='contact_catalog'&&/^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(command.target||'')&&db.prepare('SELECT 1 FROM contacts WHERE wa_jid=? OR phone_e164=? LIMIT 1').get(command.target,'+'+command.target.split('@')[0]))snapshot('catalog',command.target,{available:false,stale:true,scope:'contact_catalog',known_only:true,source:'checked_baileys_iq',error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
        if(['catalog','collections'].includes(command.kind)) {
          const ownJid=current.user?.id?.replace(/:\d+(?=@)/,'');
          if(/^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(ownJid||'')) {
            const prior=db.prepare('SELECT 1 FROM snapshots WHERE kind=? AND resource_id=?').get(command.kind,ownJid);
            snapshot(command.kind,ownJid,{available:false,stale:Boolean(prior),error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
            const childKind=command.kind==='catalog'?'product':'collection';
            db.prepare(`UPDATE snapshots SET payload=json_set(payload,'$.stale',json('true')),updated_at=? WHERE kind=? AND json_extract(payload,'$.owner_jid')=?`).run(new Date().toISOString(),childKind,ownJid);
          }
        }
        if(command.kind==='bot_list')snapshot('bot_list','wis-5679',{available:false,stale:true,partial:true,complete:false,error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
        if(command.kind==='newsletter_messages')snapshot('newsletter_messages',command.target,{available:false,stale:true,partial:true,complete:false,error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
        if(command.kind==='disappearing_mode')snapshot('disappearing_mode',command.target,{available:false,response_verified:false,stale:true,scope:'known_chat',error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
        if(command.kind==='group_invite')snapshot('group_invite',command.target,{code:null,expires_at:null,available:false,response_verified:false,stale:false,error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
        if(command.kind==='community_invite')snapshot('community_invite',command.target,{code:null,expires_at:null,available:false,response_verified:false,stale:false,error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString()});
        if(['community_subgroups','group_requests'].includes(command.kind))snapshot(command.kind,command.target,{available:false,stale:true,error:failure.code,status_code:failure.status_code,last_attempt_at:new Date().toISOString(),...(command.kind==='group_requests'?{skipped:false,skip_reason:null}:{})});
        if(command.kind==='avatar'||command.kind==='avatars') {
          const prior=db.prepare("SELECT payload FROM snapshots WHERE kind='avatar' AND resource_id=?").get(command.target);
          snapshot('avatar',command.target,{available:false,stale:Boolean(prior),error:failure.code,scope:'profile_picture',last_attempt_at:new Date().toISOString()});
        }
        if(command.kind==='avatars')updateAvatarCoverage(current,{checkedCount:command.target?1:0,lastReadError:failure.code});
        if(command.kind==='history' && db.prepare("SELECT 1 FROM snapshots WHERE kind='history_request' AND resource_id=?").get(command.id))snapshot('history_request',command.id,{status:'outcome_unknown',error:failure.code,complete:false});
        const summaryKind={catalog:'catalog',collections:'collections',blocklist:'blocklist',communities:'communities',community:'communities',newsletter:'newsletters',newsletters:'newsletters',groups:'groups',all:'groups'}[command.kind];
        const resource=['catalog','collections'].includes(command.kind)?current.user?.id?.replace(/:\d+(?=@)/,''):'wis-5679';
        if(summaryKind && resource) {
          const prior=db.prepare('SELECT payload FROM snapshots WHERE kind=? AND resource_id=?').get(summaryKind,resource);
          let priorData={};try{priorData=JSON.parse(prior?.payload||'{}');}catch{}
          snapshot(summaryKind,resource,{available:false,stale:Boolean(prior),error:failure.code,status_code:failure.status_code,provider_code:failure.provider_code ?? null,...(prior?{scope:priorData.scope??null,known_only:priorData.known_only??null,source:priorData.source??null}:{}),last_attempt_phase:failure.phase??null,...(attemptScope?{last_attempt_scope:attemptScope.scope??null,last_attempt_source:attemptScope.source??null,fallback_reason:attemptScope.fallback_reason??null,fallback_phase:attemptScope.fallback_phase??null}:{fallback_reason:null,fallback_phase:null}),last_attempt_at:new Date().toISOString()});
        }
        event('read.failed',command.target || 'wis-5679',{kind:command.kind,command_id:command.id,error:failure.code,status_code:failure.status_code});
      }
    } finally {readBusy=false;activeReadCommand=null;}
  }
  const patch = (values) => {
    if (!owns()) return;
    db.prepare(`UPDATE connections SET ${Object.keys(values).map(k => `${k}=?`).join(',')},updated_at=? WHERE id='wis-5679' AND lease_owner=?`).run(...Object.values(values), new Date().toISOString(), owner);
  };
  function closeSocket() {
    const old = sock; sock = null;
    if (old) old.end(new Error('local_worker_stopped'));
  }
  function expireStories() {
    if(!owns())return;
    db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.body',NULL,'$.expired',json('true')),updated_at=? WHERE kind='story' AND json_extract(payload,'$.expires_at')<=? AND json_extract(payload,'$.expired') IS NOT 1").run(new Date().toISOString(),new Date().toISOString());
  }
  async function lookupGroupMetadataByInviteCode(inviteCode) {
    if(!validGroupInviteCode(inviteCode))throw new Error('invalid_invite_code');
    if(readBusy)throw new Error('previous_read_unresolved');
    const current=sock;
    if(!current||!owns()||connection().status!=='connected')throw new Error('connection_unavailable');
    readBusy=true;lastReadAt=Date.now();
    try{return groupMetadataByInviteCode(await readCall(current,'groupGetInviteInfo',[inviteCode]));}
    finally{readBusy=false;}
  }
  async function lookupNewsletterByInviteCode(inviteCode) {
    if(!validNewsletterInviteCode(inviteCode))throw new Error('invalid_invite_code');
    if(readBusy)throw new Error('previous_read_unresolved');
    const current=sock;
    if(!current||!owns()||connection().status!=='connected')throw new Error('connection_unavailable');
    readBusy=true;lastReadAt=Date.now();
    try{const value=await readCall(current,'newsletterMetadata',['invite',inviteCode]);if(!value)throw new Error('invalid_newsletter_metadata_response');return newsletterByInviteMetadata(value);}
    finally{readBusy=false;}
  }
  function revokeStory(key) {
    if(!owns()||!key?.id)return;
    if(typeof key.id!=='string'||!/^[\x21-\x7e]{1,256}$/.test(key.id))return;
    if(key.participant!==undefined && key.participant!==null && !/^\d+@(s\.whatsapp\.net|lid)$/.test(key.participant))return;
    const author=/^\d+@(s\.whatsapp\.net|lid)$/.test(key.participant || '')?key.participant:null;
    snapshot('story_revocation',author?author+':'+key.id:key.id,{id:key.id,...(author?{author}:{}),revoked:true});
    db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.body',NULL,'$.revoked',json('true')),updated_at=? WHERE kind='story' AND json_extract(payload,'$.id')=? AND (? IS NULL OR json_extract(payload,'$.author')=?)").run(new Date().toISOString(),key.id,key.participant || null,key.participant || null);
  }
  function persistStory(msg,source) {
    const id=msg.key?.id,author=msg.key?.participant || (msg.key?.fromMe?sock?.user?.id?.replace(/:\d+(?=@)/,''):null);
    if(typeof id!=='string'||!/^[\x21-\x7e]{1,256}$/.test(id)||!/^\d+@(s\.whatsapp\.net|lid)$/.test(author || ''))return;
    const message=msg.message?.ephemeralMessage?.message || msg.message;
    if(message?.protocolMessage?.type===0){const key=message.protocolMessage.key;if(key?.participant&&key.participant!==author)return;revokeStory({...key,participant:author});return;}
    const date=timestamp(msg.messageTimestamp);if(!date)return;
    const expires_at=new Date(Date.parse(date)+86400000).toISOString(),expired=Date.parse(expires_at)<=Date.now();
    const resource=author+':'+id;
    if(db.prepare("SELECT 1 FROM snapshots WHERE kind='story_revocation' AND resource_id IN (?,?)").get(id,resource))return;
    const existing=db.prepare("SELECT payload FROM snapshots WHERE kind='story' AND resource_id=?").get(resource);
    if(existing)return;
    if(message?.viewOnceMessage||message?.viewOnceMessageV2||message?.viewOnceMessageV2Extension)return;
    const normalized=normalizeContent(message);if(!normalized)return;
    snapshot('story',resource,{id,author,fromMe:Boolean(msg.key.fromMe),type:normalized.type,body:expired?null:typeof normalized.body==='string'?normalized.body.slice(0,8192):null,date,expires_at,source,revoked:false,expired});
  }
  async function persist(messages, source) {
    for (const msg of messages) {
      if (!owns()) return;
      try {
        const jid = msg.key?.remoteJid, waId = msg.key?.id;
        if (!jid || !waId) continue;
        if(jid==='status@broadcast'){persistStory(msg,source);continue;}
        const prior=db.prepare('SELECT m.*,c.wa_chat_id FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE m.wa_message_id=?').get(waId);
        if(prior){
          // Enrich only a matching, unchanged row from an already delivered envelope.
          // Never retrieve media, mutate message rows, or cache duplicated wire data.
          if(prior.wa_chat_id!==jid||typeof msg.key.fromMe!=='boolean'||prior.direction!==(msg.key.fromMe?'out':'in')||prior.body===null||!Number.isFinite(Date.parse(prior.created_at)))continue;
          if(db.prepare("SELECT 1 FROM snapshots WHERE kind='message' AND resource_id=?").get(waId))continue;
          if(db.prepare("SELECT 1 FROM events WHERE (resource_id=? AND kind IN('message.revoked','message.edited')) OR (resource_id=? AND kind='messages.delete_all') LIMIT 1").get(waId,jid))continue;
          const raw=msg.message,content=raw?.ephemeralMessage?.message||raw?.documentWithCaptionMessage?.message||raw;
          if(!content||content.viewOnceMessage||content.viewOnceMessageV2||content.viewOnceMessageV2Extension||content.editedMessage||content.protocolMessage)continue;
          const normalized=normalizeContent(content);
          if(!normalized||normalized.type!==prior.type||typeof normalized.body!=='string'||normalized.body!==prior.body)continue;
          const observed_at=new Date().toISOString();
          const stubType=safeMessageStubType(msg),payload={type:normalized.type,details:normalized.details,...messageContext(content),...(stubType!==null?{messageStubType:stubType}:{}),source:prior.source,timestamp:prior.created_at,metadata_backfilled:true,metadata_observed_at:observed_at};
          db.prepare("INSERT OR IGNORE INTO snapshots(kind,resource_id,payload,updated_at) VALUES('message',?,?,?)").run(waId,JSON.stringify(payload),observed_at);
          continue;
        }
        const at = timestamp(msg.messageTimestamp) || (source === 'live' ? new Date().toISOString() : null);
        if (!at) continue;
        const raw = msg.message;
        const m = raw?.ephemeralMessage?.message || raw?.documentWithCaptionMessage?.message || raw;
        if (!m) continue;
        const normalized=normalizeContent(m);
        if(!normalized)continue;
        const {type,body,details}=normalized;
        const phone = jid.endsWith('@s.whatsapp.net') ? '+' + jid.split('@')[0].split(':')[0] : null;
        let contact = null;
        if (!jid.endsWith('@g.us')) {
          contact = db.prepare('SELECT * FROM contacts WHERE wa_jid=? OR (phone_e164 IS NOT NULL AND phone_e164=?)').get(jid, phone);
          if (!contact) {
            contact = {id:randomUUID()};
            db.prepare('INSERT INTO contacts(id,phone_e164,wa_jid,display_name,created_at) VALUES(?,?,?,?,?)').run(contact.id, phone, jid, msg.key.fromMe ? phone || jid : msg.pushName || phone || jid, at);
          }
        }
        let chat = db.prepare('SELECT * FROM conversations WHERE wa_chat_id=?').get(jid);
        if (!chat) {
          chat = {id:randomUUID()};
          db.prepare('INSERT INTO conversations(id,contact_id,wa_chat_id,last_message_preview,last_message_at) VALUES(?,?,?,?,?)').run(chat.id,contact?.id || null,jid,body || `[${type}]`,at);
        }
        let media = null;
        // History persistence never triggers a media reupload request or other WA write.
        if (source === 'live' && ['image','audio','document','video','sticker'].includes(type)) {
          try {
            const data = await baileys.downloadMediaMessage(msg,'buffer',{}, {logger});
            if (owns() && Buffer.isBuffer(data) && data.length <= 25*1024*1024) {
              media = randomUUID() + '.' + ({image:'jpg',audio:'ogg',document:'bin',video:'mp4',sticker:'webp'}[type]);
              writeFileSync(mediaFile(mediaDir, media),data,{mode:0o600});
            }
          } catch { /* Keep readable message when media has expired. */ }
        }
        if (!owns()) return;
        db.prepare(`INSERT OR IGNORE INTO messages(id,conversation_id,wa_message_id,direction,type,body,media_path,delivery_status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(randomUUID(),chat.id,waId,msg.key.fromMe?'out':'in',type,body,media,msg.key.fromMe?'sent':'delivered',source,at);
        const stubType=safeMessageStubType(msg);snapshot('message',waId,{type,details,...messageContext(m),...(stubType!==null?{messageStubType:stubType}:{}),participant:msg.key.participant || null,push_name:msg.pushName || null,source,timestamp:at});
        db.prepare('UPDATE conversations SET last_message_preview=?,last_message_at=? WHERE id=? AND (last_message_at IS NULL OR last_message_at<=?)').run(body || `[${type}]`,at,chat.id,at);
        if (msg.message) { cache.set(waId,msg.message); if(cache.size>1000) cache.delete(cache.keys().next().value); }
      } catch { console.error('message_persistence_failed'); }
    }
  }
  const enqueue = (messages, source) => { queue = queue.then(() => persist(messages,source)).catch(() => console.error('history_queue_failed')); };

  async function connect() {
    if (sock || starting || !owns() || !desired || Date.now()<nextConnect) return;
    starting = true;
    try {
      const {state,saveCreds} = await baileys.useMultiFileAuthState(authDir);
      if (!owns() || !desired) return;
      const current = baileys.default({auth:{creds:state.creds,keys:baileys.makeCacheableSignalKeyStore(state.keys,logger)},logger,markOnlineOnConnect:false,getMessage:async key=>cache.get(key.id)});
      sock=current;
      current.ev.on('creds.update', () => { if(owns() && sock===current) credentialsSaved=credentialsSaved.then(saveCreds).catch(()=>console.error('session_save_failed')); });
      current.ev.on('messages.upsert', ({messages}) => {if(owns() && sock===current) enqueue(messages,'live');});
      const guarded = handler => payload => {
        if(!owns() || sock!==current)return;
        try {handler(payload);} catch {console.error('metadata_persistence_failed');}
      };
      attachNewsletterEvents(current.ev,{guarded,snapshot,event});
      attachAccountSettings(current.ev,{guarded,snapshot});
      attachGroupMemberTags(current.ev,{guarded,snapshot});
      current.ev.on('blocklist.update',guarded(value=>blocklistInvalidation.observe(value)));
      current.ev.on('messaging-history.set', guarded(({messages,contacts,chats,progress,isLatest,syncType,lidPnMappings,peerDataRequestSessionId}) => {
        if(contacts?.length)saveContacts(contacts);
        if(lidPnMappings?.length)for(const mapping of lidPnMappings.slice(0,10000))saveIdentity(mapping,'messaging-history.set');
        if(chats?.length)saveChats(chats);
        snapshot('history','wis-5679',{...safeFields({progress,isLatest,syncType},['progress','isLatest','syncType']),messages_in_chunk:messages?.length || 0,contacts_in_chunk:contacts?.length || 0,chats_in_chunk:chats?.length || 0});
        if(messages?.length)enqueue(messages,'import');
        // Correlate only an explicit request id; simultaneous automatic history
        // chunks must never be credited to a user-requested fetch by timing alone.
        if(typeof peerDataRequestSessionId==='string' && peerDataRequestSessionId) {
          const request=db.prepare("SELECT resource_id,payload FROM snapshots WHERE kind='history_request' AND json_extract(payload,'$.request_id')=? LIMIT 1").get(peerDataRequestSessionId);
          if(request) {
            const prior=JSON.parse(request.payload);
            const count=(messages || []).filter(m=>m.key?.remoteJid===prior.target).length;
            snapshot('history_request',request.resource_id,{status:'arrived',received_count:(prior.received_count || 0)+count,chunks_received:(prior.chunks_received || 0)+1,last_arrived_at:new Date().toISOString(),complete:false});
            event('history.arrived',prior.target,{command_id:request.resource_id,received_count:count,correlated:true,complete:false});
          }
        }
      }));
      current.ev.on('messaging-history.status',guarded(value=>{snapshot('history','wis-5679',safeFields(value,['syncType','status','explicit']));event('history.status','wis-5679',safeFields(value,['syncType','status','explicit']));}));
      current.ev.on('contacts.upsert', guarded(contacts=>saveContacts(contacts)));
      current.ev.on('contacts.update', guarded(contacts=>saveContacts(contacts)));
      current.ev.on('lid-mapping.update',guarded(mapping=>saveIdentity(mapping,'lid-mapping.update')));
      current.ev.on('group.join-request',guarded(value=>{
        const participant=value?.participant;
        const participantPattern=/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/;
        if(!/^\d+(?:-\d+)?@g\.us$/.test(value?.id||'')||value.id.length>100||typeof participant!=='string'||participant.length>100||!participantPattern.test(participant)||!['created','revoked','rejected'].includes(value.action))return;
        const resource=value.id+':'+participant,observed_at=new Date().toISOString();
        const fields={group_id:value.id,participant,action:value.action,observed_at,source:'group.join-request',author:null,authorPn:null,participantPn:null};
        if(['invite_link','linked_group_join','non_admin_add'].includes(value.method))fields.method=value.method;
        for(const key of ['author','authorPn','participantPn'])if(typeof value[key]==='string'&&value[key].length<=100&&participantPattern.test(value[key])&&(key==='author'||value[key].endsWith('@s.whatsapp.net')))fields[key]=value[key];
        let prior={};try{prior=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_join_event' AND resource_id=?").get(resource)?.payload||'{}');}catch{}
        const history=(Array.isArray(prior.history)?prior.history:[]).filter(x=>['created','revoked','rejected'].includes(x?.action)&&typeof x.observed_at==='string'&&Number.isFinite(Date.parse(x.observed_at))).slice(-19).map(x=>({action:x.action,observed_at:new Date(x.observed_at).toISOString(),...(['invite_link','linked_group_join','non_admin_add'].includes(x.method)?{method:x.method}:{})}));history.push({action:fields.action,...(fields.method?{method:fields.method}:{}),observed_at});
        snapshot('group_join_event',resource,{...fields,method:fields.method || null,history});
      }));
      current.ev.on('chats.upsert', guarded(chats=>saveChats(chats)));
      current.ev.on('chats.update', guarded(chats=>saveChats(chats)));
      current.ev.on('groups.upsert', guarded(groups=>saveGroups(groups)));
      current.ev.on('groups.update', guarded(groups=>saveGroups(groups)));
      current.ev.on('presence.update', guarded(value=>{
        const observedAt=new Date().toISOString(),presences={};for(const [jid,p] of Object.entries(value.presences || {}).slice(0,256))if(/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(jid))presences[jid]={...safeFields(p,['lastKnownPresence','lastSeen','groupOnlineCount']),observed_at:observedAt};
        snapshot('presence',value.id,{presences});
        event('presence.update',value.id,{presences});
      }));
      current.ev.on('group-participants.update',guarded(value=>{
        event('group-participants.update',value.id,{...safeFields(value,['id','author','action']),participants:(value.participants || []).slice(0,4096).map(p=>safeFields(p,[...contactKeys,'admin']))});
      }));
      current.ev.on('labels.edit',guarded(value=>{
        if(!value.id)return;
        const id=String(value.id);
        snapshot('label',id,safeFields(value,['id','name','color','deleted','predefinedId']));
        if(value.deleted===true)db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.associated',json('false')),updated_at=? WHERE kind='label_association' AND json_extract(payload,'$.labelId')=?").run(new Date().toISOString(),id);
      }));
      current.ev.on('labels.association',guarded(value=>{
        const association=safeFields(value.association,['type','chatId','messageId','labelId']);
        const labelDeleted=Boolean(association.labelId&&db.prepare("SELECT 1 FROM snapshots WHERE kind='label' AND resource_id=? AND json_extract(payload,'$.deleted')=1").get(association.labelId));
        event('labels.association',association.chatId || 'wis-5679',{type:value.type,association,...(labelDeleted?{ignored_due_to_deleted_label:true}:{})});
        if(association.chatId && association.labelId)snapshot('label_association',`${association.chatId}:${association.labelId}:${association.messageId || ''}`,{...association,associated:value.type==='add'&&!labelDeleted});
      }));
      current.ev.on('messages.reaction',guarded(values=>{
        for(const value of values.slice(0,1000)) {
          const reaction={key:safeFields(value.key,['id','remoteJid','fromMe','participant']),reaction:safeFields(value.reaction,['text','senderTimestampMs']),sender:safeFields(value.reaction?.key,['id','participant','fromMe','remoteJid'])};
          event('messages.reaction',value.key?.id || 'unknown',reaction);
          if(value.key?.id)snapshot('reaction',value.key.id+':'+(value.reaction?.key?.participant || (value.reaction?.key?.fromMe?'self':value.reaction?.key?.remoteJid) || 'unknown'),{message_id:value.key.id,...reaction,removed:!value.reaction?.text});
        }
      }));
      const applyMessageChange=(key,update)=>{
        if(!owns() || sock!==current || !key?.id)return;
        if(key.remoteJid==='status@broadcast'){if(update.message===null)revokeStory(key);return;}
        const existing=db.prepare('SELECT m.id,m.conversation_id,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.wa_message_id=? AND c.wa_chat_id=?').get(key.id,key.remoteJid);
        if(!existing)return;
        const old=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id=?").get(key.id)?.payload || '{}');
        const now=new Date().toISOString();
        if(update.message===null) {
          db.prepare('UPDATE messages SET body=NULL,media_path=NULL WHERE id=?').run(existing.id);
          snapshot('message',key.id,{revoked:true,revoked_at:now,details:{},quote:{},mentions:[]});
          cache.delete(key.id);event('message.revoked',key.id,{conversation_id:existing.conversation_id,at:now});
        } else if(update.message?.editedMessage?.message && !old.revoked) {
          const at=timestamp(update.messageTimestamp) || now;
          if(old.edited_at && old.edited_at>at)return;
          const content=update.message.editedMessage.message,normalized=normalizeContent(content);
          if(!normalized)return;
          db.prepare('UPDATE messages SET body=?,type=? WHERE id=?').run(normalized.body,normalized.type,existing.id);
          snapshot('message',key.id,{type:normalized.type,details:normalized.details,...messageContext(content),edited:true,edited_at:at});
          cache.set(key.id,content);event('message.edited',key.id,{conversation_id:existing.conversation_id,at});
        } else return;
        const last=db.prepare('SELECT id,body,type FROM messages WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(existing.conversation_id);
        if(last?.id===existing.id)db.prepare('UPDATE conversations SET last_message_preview=? WHERE id=?').run(update.message===null?'Mensaje eliminado':last.body || `[${last.type}]`,existing.conversation_id);
      };
      current.ev.on('messages.delete',guarded(value=>{
        const keys=Array.isArray(value.keys)?value.keys:[];
        for(const key of keys.slice(0,1000))queue=queue.then(()=>applyMessageChange(key,{message:null})).catch(()=>console.error('message_update_failed'));
        if(value.all && value.jid)event('messages.delete_all',value.jid,{observed:true,local_messages_preserved:true});
      }));
      current.ev.on('message-receipt.update',guarded(values=>{
        for(const {key,receipt} of values.slice(0,1000)) {
          if(!key?.id)continue;
          const data=safeFields(receipt,['userJid','receiptTimestamp','readTimestamp','playedTimestamp']);
          snapshot('receipt',key.id+':'+(receipt.userJid || 'unknown'),{message_id:key.id,...data});
          event('message.receipt',key.id,data);
        }
      }));
      current.ev.on('call',guarded(values=>{
        if(!Array.isArray(values))return;
        for(const value of values.slice(0,100)) {
          if(!callSnapshot(value))continue;
          let prior={};try{prior=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='call' AND resource_id=?").get(value.id)?.payload || '{}');}catch{}
          const merged=callSnapshot(value,prior);
          db.exec('SAVEPOINT call_observation');
          try {snapshot('call',value.id,merged);event('call',value.id,{...safeFields(merged,['id','from','chatId','callerPn','groupJid','isVideo','isGroup','offline','latencyMs']),status:value.status,date:callSnapshot(value).date,observed_at:merged.observed_at});db.exec('RELEASE call_observation');}
          catch(error){db.exec('ROLLBACK TO call_observation');db.exec('RELEASE call_observation');throw error;}
        }
      }));
      current.ev.on('messages.update', updates => {
        if(!owns() || sock!==current) return;
        for(const {key,update} of updates) {
          if(update.message===null || update.message?.editedMessage?.message)queue=queue.then(()=>applyMessageChange(key,update)).catch(()=>console.error('message_update_failed'));
          const status = {2:'sent',3:'delivered',4:'read',5:'read'}[update.status];
          if(status) {
            const previous=receipts.get(key.id);
            const rank={sent:1,delivered:2,read:3};
            if(!previous || rank[status]>rank[previous])receipts.set(key.id,status);
            if(receipts.size>5000)receipts.delete(receipts.keys().next().value);
            db.prepare("UPDATE messages SET delivery_status=? WHERE wa_message_id=? AND delivery_status!='read' AND NOT(delivery_status='delivered' AND ?='sent')").run(status,key.id,status);
            db.prepare("UPDATE operations SET status=?,updated_at=? WHERE wa_message_id=? AND status IN ('sent','delivered') AND NOT(status='delivered' AND ?='sent')").run(status,new Date().toISOString(),key.id,status);
          }
        }
      });
      current.ev.on('connection.update', update => {
        if(!owns() || sock!==current) return;
        const safe=safeFields(update,['connection','isOnline','receivedPendingNotifications','isNewLogin']);
        if(Object.keys(safe).length){snapshot('connection','wis-5679',safe);event('connection.update','wis-5679',safe);}
        if(update.qr) patch({status:'qr_pending',qr_payload:update.qr,qr_expires_at:new Date(Date.now()+60000).toISOString(),last_error:null});
        if(update.connection==='open') {
          const phone = current.user?.id?.split(':')[0]?.split('@')[0] || null;
          const expected = connection().expected_phone_e164;
          if(expected && !identityMatches(phone,expected)) {
            desired=false;closeSocket();patch({status:'disconnected',phone,qr_payload:null,qr_expires_at:null,last_error:'identity_mismatch'});return;
          }
          lastOpenedAt=Date.now();patch({status:'connected',phone,qr_payload:null,qr_expires_at:null,last_error:expected?null:'identity_unverified'});
          snapshot('profile','wis-5679',safeFields(current.user,contactKeys));
          if(!db.prepare("SELECT id FROM read_commands WHERE status IN ('pending','running') AND kind='all'").get()) {
            const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,'all',NULL,'pending',?,?)").run(randomUUID(),now,now);
          }
        }
        if(update.connection==='close') {
          sock=null;
          const rawCode=update.lastDisconnect?.error?.output?.statusCode,code=Number.isInteger(rawCode)&&rawCode>=100&&rawCode<=599?rawCode:null,closedAt=Date.now();
          snapshot('connection_diagnostics','wis-5679',{last_disconnect_at:new Date(closedAt).toISOString(),status_code:code,reason:connectionCloseReasons[code]||'unknown'});
          if(code===baileys.DisconnectReason.loggedOut) {desired=false;patch({status:'disconnected',qr_payload:null,qr_expires_at:null,last_error:'session_revoked'});return;}
          const decision=reconnectDecision({attempts,lastOpenedAt,now:closedAt});
          attempts=decision.attempts;lastOpenedAt=0;desired=desired&&decision.retry;
          nextConnect=closedAt+decision.delay_ms;
          patch({status:desired?'qr_pending':'disconnected',qr_payload:null,qr_expires_at:null,last_error:desired?'reconnecting':'reconnect_exhausted'});
        }
      });
    } catch {attempts++;nextConnect=Date.now()+10000;if(attempts>5) desired=false;patch({last_error:'connection_start_failed'});}
    finally {starting=false;}
  }

  function canSend(row) {
    const c=connection();
    if(process.env.WIS_OUTBOUND_ENABLED!=='true' || !owns() || !sock || c.status!=='connected' || !identityMatches(c.phone,c.expected_phone_e164)) throw new Error('outbound_disabled_or_identity_unverified');
    const contact=db.prepare('SELECT * FROM contacts WHERE phone_e164=?').get(row.to_e164);
    if(!contact || contact.opted_out_at || !contact.consent_at || !contact.consent_source || !contact.consent_scope) throw new Error('verified_consent_required');
  }
  async function drain() {
    if(processing || process.env.WIS_OUTBOUND_ENABLED!=='true' || !owns() || !sock) return;
    processing=true;
    let row,attempted=false;
    try {
      row=db.prepare("SELECT * FROM operations WHERE status='pending' ORDER BY created_at LIMIT 1").get();
      if(!row)return;
      canSend(row);
      let content;
      if(row.type==='text') content={text:row.body};
      else if(['image','audio','document','video'].includes(row.type) && row.media_path) {
        const data=readFileSync(mediaFile(mediaDir,row.media_path));
        const mime = row.media_path.endsWith('.mp3')?'audio/mpeg':row.media_path.endsWith('.m4a')?'audio/mp4':'audio/ogg';
        content={[row.type]:data,...(row.type==='audio'?{mimetype:mime}:{caption:row.body || undefined}),...(row.type==='document'?{fileName:row.media_path,mimetype:row.media_path.endsWith('.pdf')?'application/pdf':'application/octet-stream'}:{})};
      } else throw new Error('unsupported_message');
      if(!db.prepare("UPDATE operations SET status='sending',updated_at=? WHERE id=? AND status='pending'").run(new Date().toISOString(),row.id).changes)return;
      canSend(row);
      attempted=true;
      const sent=await sock.sendMessage(row.to_e164.slice(1)+'@s.whatsapp.net',content);
      if(!sent?.key?.id)throw new Error('missing_result');
      if(sent.message)cache.set(sent.key.id,sent.message);
      db.exec('BEGIN IMMEDIATE');
      try {
        const echo=db.prepare('SELECT id,delivery_status FROM messages WHERE wa_message_id=?').get(sent.key.id);
        const rank={sent:1,delivered:2,read:3};
        const status=[echo?.delivery_status,receipts.get(sent.key.id),'sent'].filter(Boolean).sort((a,b)=>(rank[b]||0)-(rank[a]||0))[0];
        if(row.message_id && echo && echo.id!==row.message_id)db.prepare('DELETE FROM messages WHERE id=?').run(echo.id);
        if(row.message_id)db.prepare('UPDATE messages SET wa_message_id=?,delivery_status=? WHERE id=?').run(sent.key.id,status,row.message_id);
        db.prepare('UPDATE operations SET status=?,wa_message_id=?,last_error=NULL,updated_at=? WHERE id=?').run(status,sent.key.id,new Date().toISOString(),row.id);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK');throw error; }
    } catch {
      if(row)db.prepare('UPDATE operations SET status=?,last_error=?,updated_at=? WHERE id=?').run(attempted?'outcome_unknown':'failed',attempted?'reconciliation_required':'outbound_policy_or_validation_failed',new Date().toISOString(),row.id);
    } finally {processing=false;}
  }

  if(!acquireLease(db,owner)) throw new Error('another_worker_owns_connection');
  deadline=Date.now()+25000;
  desired=['connected','qr_pending'].includes(connection().status);
  db.prepare("UPDATE operations SET status='outcome_unknown',last_error='interrupted_send_requires_reconciliation' WHERE status='sending'").run();
  db.prepare("UPDATE read_commands SET status='failed',error='worker_interrupted',updated_at=? WHERE status='running'").run(new Date().toISOString());
  let ticking=false;
  let recoveredIdentities=false;
  function recoverIdentities() {
    if(recoveredIdentities||!owns())return;
    recoveredIdentities=true;
    for(const row of db.prepare("SELECT resource_id,payload,updated_at FROM snapshots WHERE kind='contact' ORDER BY updated_at,resource_id").all()) {
      let contact;try{contact=JSON.parse(row.payload);}catch{continue;}
      const lid=contact.lid || (row.resource_id.endsWith('@lid')?row.resource_id:null);
      const pn=contact.phoneNumber || (row.resource_id.endsWith('@s.whatsapp.net')?row.resource_id:null);
      if(!Number.isFinite(Date.parse(row.updated_at)))continue;
      const prior=db.prepare("SELECT payload FROM snapshots WHERE kind='identity' AND resource_id=?").get(lid || '');
      if(prior){try{const value=JSON.parse(prior.payload);if(value.pn===pn||value.candidate_pns?.includes(pn))continue;}catch{}}
      saveIdentity({lid,pn},'contacts',row.updated_at);
    }
  }
  const webhookDispatcher=createWebhookDispatcher({db,owns});
  async function tick() {
    if(stopping || ticking)return;
    ticking=true;
    try {
      if(!acquireLease(db,owner)) {deadline=0;closeSocket();return;}
      deadline=Date.now()+25000;
      expireStories();
      expireGroupInvites(db);
      recoverIdentities();
      const c=connection();
      if(c.qr_expires_at && c.qr_expires_at<=new Date().toISOString())patch({qr_payload:null,qr_expires_at:null});
      if(c.command) {
        patch({command:null});
        if(c.command==='logout') {
          desired=false; const old=sock;sock=null;
          if(old) await old.logout().catch(()=>{});
          for(const f of readdirSync(authDir,{withFileTypes:true})) if(f.isFile() && f.name.endsWith('.json'))unlinkSync(resolve(authDir,f.name));
          patch({status:'disconnected',phone:null,qr_payload:null,qr_expires_at:null,last_error:null});
        }
        else if(c.command==='disconnect') {desired=false;closeSocket();patch({status:'disconnected',qr_payload:null,qr_expires_at:null,last_error:null});}
        else if(c.command==='recover') {
          desired=false;closeSocket();
          try {
            let timeout;
            try {
              await Promise.race([credentialsSaved,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('session_save_drain_timeout')),10000);timeout.unref?.();})]);
            } finally {clearTimeout(timeout);}
            if(!owns())throw new Error('session_recovery_lease_lost');
            const latest=connection();
            if(latest.status!=='disconnected'||latest.last_error!=='session_revoked')throw new Error('session_recovery_not_available');
            archiveRejectedAuthDirectory(authDir);
            attempts=0;lastOpenedAt=0;nextConnect=0;desired=true;
            patch({status:'qr_pending',phone:null,qr_payload:null,qr_expires_at:null,last_error:null});
            console.log('session_auth_archived_for_recovery');
          } catch {
            desired=false;patch({status:'disconnected',qr_payload:null,qr_expires_at:null,last_error:'session_recovery_failed'});
            console.error('session_auth_recovery_failed');
          }
        }
        else if(c.command==='connect' || c.command==='reconnect') {desired=true;attempts=0;lastOpenedAt=0;nextConnect=0;closeSocket();patch({status:'qr_pending',qr_payload:null,qr_expires_at:null,last_error:null});}
      }
      await connect();
      void drain();
      void drainReads();
      void webhookDispatcher.tick().catch(()=>{});
    } catch {console.error('worker_tick_failed');}
    finally {ticking=false;}
  }
  const timer=setInterval(()=>void tick(),2000);
  const watchdog=setInterval(()=>{if(!owns())closeSocket();},500);
  let stopPromise;
  const stop=()=>stopPromise || (stopPromise=(async()=>{
    stopping=true;clearInterval(timer);clearInterval(watchdog);closeSocket();
    await webhookDispatcher.stop();
    process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
    let timeout;
    try {await Promise.race([Promise.allSettled([queue,credentialsSaved,unresolvedRead?.request]),new Promise(resolve=>{timeout=setTimeout(resolve,4000);})]);}
    finally {clearTimeout(timeout);db.prepare("UPDATE connections SET lease_owner=NULL,lease_expires_at=NULL,qr_payload=NULL,qr_expires_at=NULL WHERE id='wis-5679' AND lease_owner=?").run(owner);}
  })());
  const onSignal=()=>void stop();
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  await tick();
  return {stop,drainReads,lookupGroupMetadataByInviteCode,lookupNewsletterByInviteCode};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  // Values are read locally and are never printed, including the QR and auth state.
  const env=resolve(root,'.env.local');
  if(existsSync(env)) for(const line of readFileSync(env,'utf8').split(/\r?\n/)) {
    const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m && process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }
  const {openDatabase}=await import('./db.mjs');
  const baileys=await import(pathToFileURL(requireWorker.resolve('baileys')).href);
  const pino=requireWorker('pino');
  runWorker({db:openDatabase(),baileys,logger:pino({level:'silent'}),publicCatalogReaderFactory:createPublicCatalogReader}).then(worker=>{
    process.on('message',message=>{
      if(message?.type==='wis.shutdown')void worker.stop().then(()=>process.exit(0));
      if(message?.type==='wis.group_invite_info.lookup'&&typeof message.request_id==='string'){
        void worker.lookupGroupMetadataByInviteCode(message.invite_code).then(result=>{
          if(process.connected)process.send({type:'wis.group_invite_info.result',request_id:message.request_id,result},()=>{});
        }).catch(error=>{
          const code=['read_timeout','previous_read_unresolved','connection_unavailable','connection_changed','capability_unavailable','invalid_group_metadata_response','invalid_invite_code'].includes(error?.message)?error.message:classifyReadError(error).code;
          if(process.connected)process.send({type:'wis.group_invite_info.result',request_id:message.request_id,error:code},()=>{});
        });
      }
      if(message?.type==='wis.newsletter_invite_info.lookup'&&typeof message.request_id==='string'){
        void worker.lookupNewsletterByInviteCode(message.invite_code).then(result=>{
          if(process.connected)process.send({type:'wis.newsletter_invite_info.result',request_id:message.request_id,result},()=>{});
        }).catch(error=>{
          const code=['read_timeout','previous_read_unresolved','connection_unavailable','connection_changed','capability_unavailable','invalid_newsletter_metadata_response','newsletter_unavailable','invalid_invite_code'].includes(error?.message)?error.message:classifyReadError(error).code;
          if(process.connected)process.send({type:'wis.newsletter_invite_info.result',request_id:message.request_id,error:code},()=>{});
        });
      }
    });
  }).catch(()=>{console.error('worker_start_failed');process.exitCode=1;});
}
