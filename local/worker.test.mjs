import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readdirSync,readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {proto} from 'baileys';
import {PublicCatalogError} from './catalog-http.mjs';
import {timestamp,identityMatches,acquireLease,mediaFile,runWorker,safeGroup,normalizeContent,classifyReadError,readBudgetMs,readCallBudgetMs,checkedBusinessRead,checkedListRead,callSnapshot,checkedGroupRead,checkedAccountLimits,checkedNewsletterMessages,reconnectDecision} from './worker.mjs';

test('rapid connection flaps reach a bounded reconnect stop while stable sessions reset the streak',()=>{
 let attempts=0;const delays=[];
 for(let index=0;index<5;index++){const decision=reconnectDecision({attempts,lastOpenedAt:1000+index*10000,now:2000+index*10000});attempts=decision.attempts;delays.push(decision.delay_ms);assert.equal(decision.retry,true);}
 const exhausted=reconnectDecision({attempts,lastOpenedAt:51000,now:52000});assert.equal(exhausted.retry,false);assert.equal(exhausted.attempts,6);assert.deepEqual(delays,[2000,4000,8000,16000,32000]);
 const stable=reconnectDecision({attempts:5,lastOpenedAt:1000,now:61000});assert.deepEqual(stable,{attempts:1,retry:true,delay_ms:2000});
});

test('account limits require actual objects and never default missing restriction to inactive',async()=>{
 const socket=value=>({query:async(node,timeout)=>{assert.equal(node.attrs.type,'get');assert.equal(timeout,10000);return {tag:'iq',attrs:{type:'result'},content:[{tag:'result',content:Buffer.from(JSON.stringify({data:{xwa2_fetch_account_reachout_timelock:value,xwa2_message_capping_info:value}}))}]};}});
 for(const value of [null,undefined,[]])await assert.rejects(checkedAccountLimits(socket(value),'timelock'),/invalid_limits_response/);
 await assert.rejects(checkedAccountLimits({query:async()=>undefined},'quota'),/read_timeout/);
 await assert.rejects(checkedAccountLimits(socket({secret:'PRIVATE'}),'timelock'),/invalid_limits_response/);
 const quota=await checkedAccountLimits(socket({total_quota:100,used_quota:0,capping_status:'CAPPED',mv_status:'BOGUS',cycle_start_timestamp:'1700000000'}),'quota');assert.equal(quota.used_quota,0);assert.equal(quota.mv_status,null);assert.equal(quota.cycle_start_timestamp,'1700000000');assert.equal(quota.capping_status,'CAPPED');
 const restricted=await checkedAccountLimits(socket({is_active:true,time_enforcement_ends:'1700000000',enforcement_type:'WEB_COMPANION_ONLY'}),'timelock');assert.equal(restricted.is_active,true);
 const quality=await checkedAccountLimits(socket({enforcement_type:'BIZ_QUALITY'}),'timelock');assert.equal(quality.enforcement_type,'BIZ_QUALITY');assert.equal(quality.is_active,null);
});

test('checked group lists require verified container and never turn timeout into empty data',async()=>{
 for(const value of [undefined,{tag:'iq',attrs:{type:'result'},content:[]}])await assert.rejects(checkedGroupRead({query:async()=>value},'community_subgroups','123@g.us'));
 const query=async(node,timeout)=>{assert.equal(node.attrs.type,'get');assert.equal(timeout,10000);return {tag:'iq',attrs:{type:'result'},content:[{tag:node.content[0].tag,attrs:{},content:[]}]};};
 assert.deepEqual(await checkedGroupRead({query},'community_subgroups','123@g.us'),{rows:[],truncated:false});
 const groups=await checkedGroupRead({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'sub_groups',content:[{tag:'group',attrs:{id:'456',subject:'Group',secret:'SECRET'}}]}]})},'community_subgroups','123@g.us');assert.equal(groups.rows[0].id,'456@g.us');assert.equal(JSON.stringify(groups).includes('SECRET'),false);
 const requests=await checkedGroupRead({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'membership_approval_requests',content:[{tag:'membership_approval_request',attrs:{jid:'123@lid',request_time:'1700000000',invite_code:'SECRET'}}]}]})},'group_requests','123@g.us');assert.deepEqual(requests.rows,[{jid:'123@lid',request_time:'1700000000'}]);
});

test('known newsletter message reads require a verified response and retain only bounded safe fields',async()=>{
 const target='123@newsletter';let request;
 const valid={tag:'iq',attrs:{type:'result',secret:'private'},content:[{tag:'message_updates',content:[{tag:'message',attrs:{message_id:'message-1',server_id:'42',t:'1700000000',secret:'private'},content:[{tag:'plaintext',content:Buffer.from(proto.Message.encode({conversation:'channel text'}).finish())}]}]}]};
 const result=await checkedNewsletterMessages({query:async(node,timeout)=>{request={node,timeout};return valid;}},target);
 assert.equal(request.timeout,10000);assert.deepEqual(request.node,{tag:'iq',attrs:{type:'get',xmlns:'newsletter',to:target},content:[{tag:'message_updates',attrs:{count:'50'}}]});
 assert.equal(result.count,1);assert.equal(result.partial,true);assert.equal(result.complete,false);assert.equal(result.messages[0].id,'message-1');assert.equal(result.messages[0].server_id,'42');assert.equal(result.messages[0].type,'text');assert.equal(result.messages[0].body,'channel text');assert.equal(result.messages[0].media_available,false);assert.equal(JSON.stringify(result).includes('private'),false);
 const empty=await checkedNewsletterMessages({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'message_updates',content:[]}]})},target);assert.deepEqual(empty.messages,[]);assert.equal(empty.complete,false);
 const many=await checkedNewsletterMessages({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'messages',content:Array.from({length:51},(_,index)=>({tag:'message',attrs:{id:'msg-'+index}}))}]})},target);assert.equal(many.count,50);assert.equal(many.truncated,true);
 for(const reply of [undefined,{tag:'iq',attrs:{type:'result'},content:[]},{tag:'iq',attrs:{type:'error'},content:[{tag:'error',attrs:{code:'403',secret:'private'}}]},{tag:'iq',attrs:{type:'result'},content:[{tag:'message_updates',content:[{tag:'bad'}]}]}])await assert.rejects(checkedNewsletterMessages({query:async()=>reply},target));
 await assert.rejects(checkedNewsletterMessages({query:async()=>valid},'not-a-newsletter'));
});

test('newsletter aggregate timeout marks unattempted later metrics stale without another provider call',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const target='123@newsletter',now=new Date().toISOString(),dir=mkdtempSync(resolve(tmpdir(),'wis-newsletter-count-timeout-')),ev=new EventEmitter();
 db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('newsletter',?,?,?)").run(target,JSON.stringify({id:target,name:'Known channel'}),now);
 db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('newsletter_counts',?,?,?)").run(target,JSON.stringify({available:true,response_verified:true,partial:false,fields:{subscribers:{available:true,response_verified:true,stale:false,value:42,observed_at:now},admin_count:{available:true,response_verified:true,stale:false,value:2,observed_at:now}}}),now);
 let adminCalls=0;const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},newsletterSubscribers:()=>new Promise(()=>{}),newsletterAdminCount:async()=>{adminCalls++;return 2;}};const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readTimeoutMs:10,readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES('count-timeout','newsletter_counts',?,'pending',?,?)").run(target,at,at);await worker.drainReads();assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='count-timeout'").get().status,'failed');const data=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter_counts' AND resource_id=?").get(target).payload);assert.equal(data.fields.subscribers.error,'read_timeout');assert.equal(data.fields.subscribers.stale,true);assert.equal(data.fields.subscribers.value,42);assert.equal(data.fields.admin_count.available,false);assert.equal(data.fields.admin_count.response_verified,false);assert.equal(data.fields.admin_count.stale,true);assert.equal(data.fields.admin_count.error,'read_pending');assert.equal(data.fields.admin_count.value,2);assert.equal(adminCalls,0);}
 finally{await worker.stop();db.close();}
});


test('scheduled group request read advances past failed known groups and stays read-only',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-group-requests-scheduled-')),ev=new EventEmitter(),chosen='222@g.us';let writes=0,failFirst=true;const queried=[];
 for(const [jid,updated] of [['111@g.us','2026-01-02T00:00:00.000Z'],[chosen,'2026-01-01T00:00:00.000Z']])db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('group',?,?,?)").run(jid,JSON.stringify({subject:'Known group'}),updated);
 db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('group_requests','111@g.us',?,?)").run(JSON.stringify({available:true,requests:[]}), '2026-02-01T00:00:00.000Z');
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},query:async node=>{queried.push(node.attrs.to);assert.equal(node.content[0].tag,'membership_approval_requests');if(failFirst){failFirst=false;return{tag:'iq',attrs:{type:'error'},content:[{tag:'error',attrs:{code:'403'}}]};}return{tag:'iq',attrs:{type:'result'},content:[{tag:'membership_approval_requests',attrs:{},content:[{tag:'membership_approval_request',attrs:{jid:'123@lid',request_method:'invite_link',request_time:'1700000000',secret:'never-store'}}]}]};},sendMessage(){writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}},worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();queried.length=0;const enqueue=async id=>{const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,'group_requests','pending',?,?)").run(id,at,at);await worker.drainReads();};await enqueue('scheduled-group-requests-failed');let command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='scheduled-group-requests-failed'").get();assert.equal(command.target,chosen);assert.equal(command.status,'failed');const failed=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_requests' AND resource_id=?").get(chosen).payload);assert.equal(failed.available,false);assert.equal(failed.stale,true);await enqueue('scheduled-group-requests-next');command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='scheduled-group-requests-next'").get();assert.equal(command.target,'111@g.us');assert.equal(command.status,'done',command.error);assert.deepEqual(queried,[chosen,'111@g.us']);const result=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_requests' AND resource_id='111@g.us'").get().payload);assert.equal(result.available,true);assert.equal(result.requests[0].jid,'123@lid');assert.equal(JSON.stringify(result).includes('never-store'),false);assert.equal(writes,0);}
 finally{await worker.stop();db.close();}
});

test('group request reads are explicitly skipped when known metadata says approval is disabled',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-group-requests-disabled-')),ev=new EventEmitter(),target='333@g.us';let providerCalls=0,writes=0;
 db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('group',?,?,?)").run(target,JSON.stringify({subject:'Known group',joinApprovalMode:false}),new Date().toISOString());
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},query:async()=>{providerCalls++;if(providerCalls===1)return{tag:'iq',attrs:{type:'error'},content:[{tag:'error',attrs:{code:'500'}}]};return iq('membership_approval_requests',[]);},sendMessage(){writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}},worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();providerCalls=0;const enqueue=async id=>{const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,'group_requests',?,'pending',?,?)").run(id,target,at,at);await worker.drainReads();};await enqueue('approval-disabled');let command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='approval-disabled'").get(),result=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_requests' AND resource_id=?").get(target).payload);assert.deepEqual({...command},{target,status:'done',error:null});assert.equal(result.available,false);assert.equal(result.response_verified,false);assert.equal(result.skipped,true);assert.equal(result.skip_reason,'approval_not_enabled');assert.equal(result.source,'group_metadata');assert.equal(providerCalls,0);assert.equal(writes,0);assert.equal(JSON.stringify(result).includes('Known group'),false);db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.joinApprovalMode',json('true')) WHERE kind='group' AND resource_id=?").run(target);await enqueue('approval-enabled-failure');command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='approval-enabled-failure'").get();result=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_requests' AND resource_id=?").get(target).payload);assert.equal(command.status,'failed');assert.equal(result.available,false);assert.equal(result.skipped,false);assert.equal(result.skip_reason,null);assert.equal(result.status_code,500);await enqueue('approval-enabled-success');command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='approval-enabled-success'").get();result=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_requests' AND resource_id=?").get(target).payload);assert.equal(command.status,'done');assert.equal(result.available,true);assert.equal(result.response_verified,true);assert.equal(result.skipped,false);assert.equal(result.skip_reason,null);assert.equal(providerCalls,2);assert.equal(writes,0);}
 finally{await worker.stop();db.close();}
});

test('duplicate call observation preserves full bounded history',()=>{
 let prior={};for(let n=0;n<50;n++)prior=callSnapshot({id:'call',status:'ringing',date:new Date(1700000000000+n*1000)},prior);
 const next=callSnapshot({id:'call',status:'ringing',date:new Date(1700000049000)},prior);
 assert.deepEqual(next.history,prior.history);assert.equal(next.history.length,50);
});
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.prepare("INSERT INTO connections(id,status,updated_at) VALUES('wis-5679','disconnected',?)").run(new Date().toISOString());return db;}
const leaf=(tag,value)=>({tag,attrs:{},content:Buffer.from(String(value ?? ''))});
const iq=(tag,content=[])=>({tag:'iq',attrs:{type:'result'},content:[{tag,attrs:{},content}]});
const productNode=p=>({tag:'product',attrs:{},content:['id','name','description','price','currency'].map(k=>leaf(k,p[k]))});
function mockRawQueries(socket) {
 if(socket.query)return socket;
 socket.query=async node=>{
  if(node.content?.[0]?.tag==='sub_groups'){const result=await socket.communityFetchLinkedGroups(node.attrs.to);return {tag:'iq',attrs:{type:'result'},content:[{tag:'sub_groups',content:result.linkedGroups.map(x=>({tag:'group',attrs:{id:x.id.replace('@g.us',''),subject:x.subject,size:String(x.size)}}))}]};}
  const child=node.content?.[0];
  if(child?.tag==='product_catalog') {
   const result=await socket.getCatalog({jid:child.attrs.jid,limit:Number(child.content.find(x=>x.tag==='limit').content),cursor:child.content.find(x=>x.tag==='after')?.content});
   return iq('product_catalog',[...result.products.map(productNode),...(result.nextPageCursor?[{tag:'paging',attrs:{},content:[leaf('after',result.nextPageCursor)]}]:[])]);
  }
  if(child?.tag==='collections') {
   const result=await socket.getCollections(child.attrs.biz_jid,Number(child.content.find(x=>x.tag==='collection_limit').content));
   return iq('collections',result.collections.map(c=>({tag:'collection',attrs:{},content:[leaf('id',c.id),leaf('name',c.name),...c.products.map(productNode)]})));
  }
  if(node.attrs.xmlns==='blocklist')return iq('list',(await socket.fetchBlocklist()).map(jid=>({tag:'item',attrs:{jid}})));
  const communities=typeof socket.communityFetchAllParticipating==='function';
  const values=await socket[communities?'communityFetchAllParticipating':'groupFetchAllParticipating']();
  return iq('groups',Object.values(values).map(g=>({tag:'group',attrs:{id:g.id,subject:g.subject},content:g.isCommunity?[{tag:'parent',attrs:{}}]:[]})));
 };
 return socket;
}
test('checked Business query rejects timeout/missing node and accepts only protocol-backed empty or products',async()=>{
 const args=[{jid:'123456789@s.whatsapp.net',limit:100}];
 for(const value of [undefined,null])await assert.rejects(checkedBusinessRead({query:async()=>value},'getCatalog',args),/read_timeout/);
 for(const value of [iq('unrelated'),iq('product_catalog',[{tag:'unexpected',attrs:{}}])])await assert.rejects(checkedBusinessRead({query:async()=>value},'getCatalog',args),/invalid_business_response/);
 await assert.rejects(checkedBusinessRead({query:async()=>({tag:'iq',attrs:{type:'error'},content:[{tag:'error',attrs:{code:'403',text:'secret'}}]})},'getCatalog',args),error=>classifyReadError(error).code==='access_denied');
 const empty=await checkedBusinessRead({query:async(node,timeout)=>{assert.equal(timeout,60000);assert.equal(node.attrs.type,'get');return iq('product_catalog');}},'getCatalog',args);
 assert.deepEqual(empty.products,[]);
 const products=await checkedBusinessRead({query:async()=>iq('product_catalog',[productNode({id:'p',name:'Product',price:10,currency:'ARS'})])},'getCatalog',args);
 assert.equal(products.products[0].id,'p');
 await assert.rejects(checkedBusinessRead({query:async()=>undefined},'getCollections',['123456789@s.whatsapp.net',100]),/read_timeout/);
 assert.deepEqual((await checkedBusinessRead({query:async()=>iq('collections')},'getCollections',['123456789@s.whatsapp.net',100])).collections,[]);
});
test('checked list reads cannot convert missing query replies to empty snapshots',async()=>{
 for(const method of ['fetchBlocklist','groupFetchAllParticipating','communityFetchAllParticipating']) {
  await assert.rejects(checkedListRead({query:async()=>undefined},method),/read_timeout/);
  await assert.rejects(checkedListRead({query:async()=>iq('unrelated')},method),/invalid_list_response/);
 }
 assert.deepEqual(await checkedListRead({query:async(node,timeout)=>{assert.equal(timeout,10000);return iq('list');}},'fetchBlocklist'),[]);
 assert.deepEqual(await checkedListRead({query:async()=>iq('groups')},'groupFetchAllParticipating'),{});
 assert.deepEqual(await checkedListRead({query:async()=>iq('communities')},'communityFetchAllParticipating'),{});
 const groups=iq('groups',[{tag:'group',attrs:{id:'123',subject:'Community'},content:[{tag:'parent',attrs:{}}]},{tag:'group',attrs:{id:'456',subject:'Ordinary'},content:[]}]);
 const communities=await checkedListRead({query:async()=>groups},'communityFetchAllParticipating');
 assert.deepEqual(Object.keys(communities),['123@g.us']);
});
test('own-account catalog waits for a late serialized fallback; collections retain the checked budget',()=>{
  assert.equal(readBudgetMs('getCatalog'),100000);assert.equal(readBudgetMs('getCollections'),35000);
  assert.equal(readCallBudgetMs('publicCatalog'),210000);assert.equal(readCallBudgetMs('publicCollections'),210000);assert.equal(readCallBudgetMs('publicCatalog',1000),1000);
 for(const method of ['fetchStatus','fetchPrivacySettings','groupMetadata','newsletterMetadata'])assert.equal(readBudgetMs(method),12000);
 assert.equal(readBudgetMs('getCatalog',10),10);assert.equal(readBudgetMs('fetchStatus',10),10);
 assert.throws(()=>readBudgetMs('getCatalog',Infinity),/invalid_read_timeout/);
 assert.throws(()=>readBudgetMs('getCatalog',120001),/invalid_read_timeout/);
});
test('read error classification exposes only allowlisted code and safe HTTP integer',()=>{
 for(const [error,code,status] of [
  [Error('read_timeout'),'read_timeout',null],
  [new PublicCatalogError('public_catalog_http_timeout'),'read_timeout',null],
  [Error('connection_changed'),'disconnected',null],
  [Error('capability_unavailable'),'method_missing',null],
  [{message:'secret payload',output:{statusCode:401}},'access_denied',401],
  [{message:'secret payload',output:{statusCode:403}},'access_denied',403],
  [{message:'secret payload',output:{statusCode:404}},'not_found',404],
  [{message:'secret payload',statusCode:429},'rate_limited',429],
  [{message:'secret payload',status:503},'provider_error',503],
  [{message:'secret payload',statusCode:'403'},'read_failed',null],
  [{message:'secret payload',statusCode:Infinity},'read_failed',null],
  [{message:'secret payload',statusCode:400.5},'read_failed',null],
 ])assert.deepEqual(classifyReadError(error),{code,status_code:status});
});
test('complete identity, timestamp and media traversal guards',()=>{
 assert.equal(identityMatches('5491111115679','+5491111115679'),true);
 assert.equal(identityMatches('5491111115679','5679'),false);
 assert.equal(timestamp({toNumber:()=>1700000000}),'2023-11-14T22:13:20.000Z');
 assert.equal(timestamp(1700000000000),null);
 assert.throws(()=>mediaFile(resolve('media'),'../secret'),/invalid_media_path/);
});
test('metadata allowlists omit group invites/credentials and retain special message fields',()=>{
 const result=safeGroup({id:'123@g.us',subject:'Test',notify:'Group notification',owner_country_code:'AR',subjectOwnerPn:'456@s.whatsapp.net',descOwnerUsername:'owner',descId:'description-id',authorPn:'789@s.whatsapp.net',inviteCode:'secret',noiseKey:'secret',participants:[{id:'123@lid',admin:'admin',privateKey:'secret'}]});
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(result.participants[0].admin,'admin');
 assert.equal(result.notify,'Group notification');
 assert.equal(result.owner_country_code,'AR');
 assert.equal(result.subjectOwnerPn,'456@s.whatsapp.net');
 assert.equal(result.descOwnerUsername,'owner');
 assert.equal(result.descId,'description-id');
 assert.equal(result.authorPn,'789@s.whatsapp.net');
 assert.equal(Object.hasOwn(result,'inviteCode'),false);
 assert.equal(normalizeContent({locationMessage:{degreesLatitude:-34,degreesLongitude:-58,name:'Lugar',jpegThumbnail:Buffer.from('secret')}}).details.degreesLatitude,-34);
 assert.equal(normalizeContent({pollCreationMessage:{name:'Poll',options:[{optionName:'A'}],encKey:Buffer.from('secret')}}).details.options[0].optionName,'A');
 assert.equal(JSON.stringify(normalizeContent({pollUpdateMessage:{vote:{encPayload:'secret'},pollCreationMessageKey:{id:'poll'}}})).includes('secret'),false);
 assert.equal(normalizeContent({protocolMessage:{key:'secret'}}),null);
});

test('read-only metadata commands persist account/groups, normalize events and retain partial contact updates',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-read-test-'));
 const ev=new EventEmitter();let writes=0,reads=0;
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net',name:'Owner',noiseKey:'never-store'},end(){},
  fetchStatus:async()=>{reads++;return[{id:'5491111115679@s.whatsapp.net',status:{status:'About',setAt:new Date('2026-01-01T00:00:00Z'),secret:'never-store'}}];},
  fetchPrivacySettings:async()=>{reads++;return {last:'contacts',profile:'contacts',auth:'never-store'};},
  getBusinessProfile:async()=>{reads++;return {description:'Business',website:['https://example.test'],business_hours:{timezone:'America/Argentina/Buenos_Aires',config:[{day_of_week:'monday',mode:'specific_hours',open_time:540,close_time:1080,secret:'never-store'}]}};},
  groupFetchAllParticipating:async()=>{reads++;return {'123@g.us':{id:'123@g.us',subject:'Group',size:1,participants:[{id:'111@lid',admin:'admin'}],inviteCode:'never-store'}};},
  sendMessage(){writes++;},chatModify(){writes++;},groupUpdateSubject(){writes++;}
 };
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 try {
  ev.emit('connection.update',{connection:'open',qr:'never-store'});
  ev.emit('contacts.upsert',[{id:'555@lid',phoneNumber:'5491111111111@s.whatsapp.net',name:'Saved Name',verifiedName:'Business Name',secret:'never-store'}]);
  ev.emit('contacts.update',[{id:'555@lid',notify:'Push Name'}]);
  ev.emit('chats.upsert',[{id:'555@lid',name:'Saved Name',unreadCount:2,archived:true,tcToken:'never-store'}]);
  const labelAssocAt=new Date().toISOString();db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run('label_association','chat:retired:',JSON.stringify({chatId:'chat',labelId:'retired',associated:true}),labelAssocAt);
  ev.emit('labels.edit',{id:'priority',name:'Priority',color:3,deleted:false});ev.emit('labels.edit',{id:'retired',name:'Retired',color:4,deleted:true});
   ev.emit('presence.update',{id:'555@lid',presences:{'555@lid':{lastKnownPresence:'available',lastSeen:123,secret:'never-store'}}});
   ev.emit('presence.update',{id:'555@lid',presences:{'666@lid':{lastKnownPresence:'composing',groupOnlineCount:2,secret:'never-store'}}});
  await worker.drainReads();
  const profile=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='profile'").get().payload);
  assert.equal(profile.name,'Owner');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='status'").get().payload).items[0].status.setAt,'2026-01-01T00:00:00.000Z');
   assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='business'").get().payload).business_hours.config[0].open_time,540);
   const presence=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='presence' AND resource_id='555@lid'").get().payload);assert.equal(presence.presences['555@lid'].lastKnownPresence,'available');assert.equal(presence.presences['666@lid'].lastKnownPresence,'composing');assert.ok(presence.presences['555@lid'].observed_at);assert.ok(presence.presences['666@lid'].observed_at);assert.equal(JSON.stringify(presence).includes('never-store'),false);const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-09-28T06:00:00.000Z']));}static now(){return NativeDate.parse('2026-09-28T06:00:00.000Z');}};try{for(let batch=0;batch<3;batch++){const presences=Object.fromEntries(Array.from({length:256},(_,index)=>[`${batch*256+7000000+index}@lid`,{lastKnownPresence:'available'}]));ev.emit('presence.update',{id:'555@lid',presences});}}finally{globalThis.Date=NativeDate;}const bounded=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='presence' AND resource_id='555@lid'").get().payload);assert.equal(Object.keys(bounded.presences).length,512);assert.equal(bounded.presences['7000000@lid'],undefined);assert.ok(bounded.presences['7000256@lid']);assert.ok(bounded.presences['7000767@lid']);
  const contact=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact'").get().payload);
  assert.equal(contact.name,'Saved Name');assert.equal(contact.notify,'Push Name');
  assert.equal(db.prepare("SELECT display_name FROM contacts").get().display_name,'Saved Name');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='label' AND resource_id='priority'").get().payload).deleted,false);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='label' AND resource_id='retired'").get().payload).deleted,true);
  ev.emit('labels.association',{type:'add',association:{type:'label_jid',chatId:'chat',labelId:'retired'}});
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='label_association' AND resource_id='chat:retired:'").get().payload).associated,false);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM events WHERE kind='labels.association'").get().payload).ignored_due_to_deleted_label,true);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group'").get().payload).subject,'Group');
  assert.equal(db.prepare("SELECT status FROM read_commands WHERE kind='all'").get().status,'done');
  assert.equal(db.prepare("SELECT payload FROM snapshots WHERE kind='chat' AND resource_id='555@lid'").get().payload.includes('tcToken'),false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE payload LIKE '%never-store%'").get().n,0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM events WHERE payload LIKE '%never-store%'").get().n,0);
  assert.equal(reads,4);assert.equal(writes,0);
 } finally {await worker.stop();db.close();}
});
test('own account username read stores only an exact USync identity reply and preserves stale data when unmatched',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-username-test-')),ev=new EventEmitter();let writes=0,reply;
 const own='5491111115679@s.whatsapp.net';
 class User{withId(id){this.id=id;return this;}}
 class Query{constructor(){this.users=[];this.protocols=[];}withUser(user){this.users.push(user);return this;}withUsernameProtocol(){this.protocols.push({name:'username'});return this;}}
 const socket={ev,user:{id:'5491111115679:2@s.whatsapp.net'},end(){},executeUSyncQuery:async query=>{assert.equal(query.users[0].id,own);assert.deepEqual(query.protocols.map(x=>x.name),['username']);return reply;}};
 const fake={USyncUser:User,USyncQuery:Query,default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 const enqueue=async id=>{const date=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'account_username','pending',date,date);for(let attempt=0;attempt<20&&db.prepare('SELECT status FROM read_commands WHERE id=?').get(id).status==='pending';attempt++){await worker.drainReads();await new Promise(resolve=>setTimeout(resolve,5));}};
 try{
  await new Promise(resolve=>setTimeout(resolve,10));ev.emit('connection.update',{connection:'open'});
  reply={list:[{id:own,username:'wis_owner',secret:'NEVER_STORE'}]};await enqueue('username-exact');
  const stored=db.prepare("SELECT payload FROM snapshots WHERE kind='account_username' AND resource_id='wis-5679'").get();assert.ok(stored,JSON.stringify({command:db.prepare("SELECT status,error FROM read_commands WHERE id='username-exact'").get(),connection:db.prepare("SELECT status,lease_expires_at FROM connections WHERE id='wis-5679'").get()}));let value=JSON.parse(stored.payload);
  assert.deepEqual({available:value.available,response_verified:value.response_verified,username:value.username,source:value.source},{available:true,response_verified:true,username:'wis_owner',source:'usync_username_protocol'});
  assert.equal(JSON.stringify(value).includes('NEVER_STORE'),false);assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='username-exact'").get().status,'done');
  reply={list:[{id:'5491111110000@s.whatsapp.net',username:'somebody_else'}]};await enqueue('username-unmatched');
  value=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='account_username' AND resource_id='wis-5679'").get().payload);
  assert.equal(value.available,false);assert.equal(value.response_verified,false);assert.equal(value.username,'wis_owner');assert.equal(value.stale,true);assert.equal(value.error,'no_exact_username_reply');assert.equal(JSON.stringify(value).includes('somebody_else'),false);
  assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='username-unmatched'").get().status,'done');assert.equal(writes,0);
 }finally{await worker.stop();db.close();}
});
test('known-chat disappearing mode read stores only an exactly correlated duration',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();db.prepare("INSERT INTO conversations(id,wa_chat_id) VALUES('mode-chat','123@s.whatsapp.net')").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-mode-read-')),ev=new EventEmitter();let writes=0,reply;
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){},fetchDisappearingDuration:async(...jids)=>{assert.deepEqual(jids,['123@s.whatsapp.net']);return reply;},sendMessage:async()=>{writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 const enqueue=async id=>{const at=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,\'pending\',?,?)').run(id,'disappearing_mode','123@s.whatsapp.net',at,at);for(let attempt=0;attempt<20&&db.prepare('SELECT status FROM read_commands WHERE id=?').get(id).status==='pending';attempt++){await worker.drainReads();await new Promise(resolve=>setTimeout(resolve,5));}};
 try{
  ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();
  reply=[{id:'123@s.whatsapp.net',disappearing_mode:{duration:604800,setAt:new Date('2026-09-20T00:00:00Z')},secret:'NEVER_STORE'}];await enqueue('mode-exact');
  const command=db.prepare("SELECT status,error FROM read_commands WHERE id='mode-exact'").get();assert.equal(command.status,'done',command.error);
  const value=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='disappearing_mode' AND resource_id='123@s.whatsapp.net'").get().payload);assert.equal(value.duration_seconds,604800);assert.equal(value.set_at,'2026-09-20T00:00:00.000Z');assert.equal(value.scope,'known_chat');assert.equal(JSON.stringify(value).includes('NEVER_STORE'),false);
  reply=[{id:'999@s.whatsapp.net',disappearing_mode:{duration:99,setAt:new Date()}}];await enqueue('mode-unmatched');
  const stale=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='disappearing_mode' AND resource_id='123@s.whatsapp.net'").get().payload);assert.equal(stale.duration_seconds,604800);assert.equal(stale.stale,true);assert.equal(stale.error,'response_unmatched');assert.equal(writes,0);
 }finally{await worker.stop();db.close();}
});
test('scheduled disappearing-mode reads rotate across known chats and never write to WhatsApp',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 for(const [id,jid] of [['mode-own-lid','001@lid'],['mode-a','123@s.whatsapp.net'],['mode-b','456@g.us'],['mode-own-phone','5491111115679@s.whatsapp.net']])db.prepare('INSERT INTO conversations(id,wa_chat_id) VALUES(?,?)').run(id,jid);
 const dir=mkdtempSync(resolve(tmpdir(),'wis-mode-scheduled-')),ev=new EventEmitter();let writes=0,readTargets=[];
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net',lid:'001@lid',phoneNumber:'5491111115679@s.whatsapp.net'},end(){},fetchDisappearingDuration:async(...jids)=>{readTargets.push(...jids);return jids.map(id=>({id,disappearing_mode:{duration:86400,setAt:new Date('2026-09-20T00:00:00Z')}}));},sendMessage:async()=>{writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 const enqueue=async id=>{const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,'disappearing_mode',NULL,'pending',?,?)").run(id,at,at);for(let attempt=0;attempt<20&&db.prepare('SELECT status FROM read_commands WHERE id=?').get(id).status==='pending';attempt++){await worker.drainReads();await new Promise(resolve=>setTimeout(resolve,5));}};
 try{
  ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();
  await enqueue('scheduled-mode-a');await enqueue('scheduled-mode-b');
  const commands=db.prepare("SELECT id,target,status FROM read_commands WHERE kind='disappearing_mode' ORDER BY id").all();
  assert.deepEqual(commands.map(row=>({...row})),[{id:'scheduled-mode-a',target:'123@s.whatsapp.net',status:'done'},{id:'scheduled-mode-b',target:'456@g.us',status:'done'}]);
  assert.deepEqual(readTargets,['123@s.whatsapp.net','456@g.us']);
  for(const target of ['123@s.whatsapp.net','456@g.us'])assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='disappearing_mode' AND resource_id=?").get(target).payload).duration_seconds,86400);
  assert.equal(writes,0);
 }finally{await worker.stop();db.close();}
});
test('SQLite lease rejects concurrent ownership and permits expired takeover',()=>{
 const db=database();const now=Date.now();
 assert.equal(acquireLease(db,'one',now),true);
 assert.equal(acquireLease(db,'two',now),false);
 assert.equal(acquireLease(db,'one',now+1000),true);
 assert.equal(acquireLease(db,'two',now+32000),true);db.close();
});
test('a timed out read does not allow another request on the same unresolved socket',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-timeout-test-'));const ev=new EventEmitter();let reads=0,finish;
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},fetchStatus:()=>{reads++;return new Promise(resolve=>{finish=resolve;});},fetchPrivacySettings:async()=>{reads++;return{};},getBusinessProfile:async()=>{reads++;return{};},groupFetchAllParticipating:async()=>{reads++;return{};}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readTimeoutMs:10});
 try {
  ev.emit('connection.update',{connection:'open'});await worker.drainReads();
  assert.equal(reads,1);
  assert.equal(db.prepare("SELECT status FROM read_commands WHERE kind='all'").get().status,'failed');
  db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('next','groups','pending',?,?)").run(new Date().toISOString(),new Date().toISOString());
  await new Promise(resolve=>setTimeout(resolve,2050));await worker.drainReads();
  assert.equal(reads,1);assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='next'").get().status,'pending');
  finish([]);await new Promise(resolve=>setTimeout(resolve,0));await worker.drainReads();
  const late=JSON.parse(db.prepare("SELECT payload FROM events WHERE kind='read.late_completed'").get().payload);
  assert.equal(late.method,'fetchStatus');assert.ok(late.command_id);
  assert.equal(reads,2);assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='next'").get().status,'done');
 } finally {if(finish)finish([]);await worker.stop();db.close();}
});
test('mock socket QR, persistent incoming history, no sends and graceful lease release',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const ev=new EventEmitter();let sends=0,ended=0;
 const dir=mkdtempSync(resolve(tmpdir(),'wis-worker-test-'));
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){ended++;},sendMessage(){sends++;throw Error('no send allowed');}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 ev.emit('connection.update',{qr:'mock-qr'});
 assert.ok(db.prepare('SELECT qr_expires_at FROM connections').get().qr_expires_at);
 ev.emit('connection.update',{connection:'open'});
 assert.equal(db.prepare('SELECT phone FROM connections').get().phone,'5491111115679');
 ev.emit('messages.upsert',{messages:[{key:{id:'live',remoteJid:'123@g.us'},messageTimestamp:1700000001,messageStubType:1,message:{conversation:'new'}}]});
 ev.emit('messaging-history.set',{messages:[{key:{id:'old',remoteJid:'123@g.us'},messageTimestamp:1700000000,message:{conversation:'old'}}]});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n,2);
 assert.equal(db.prepare("SELECT source FROM messages WHERE wa_message_id='old'").get().source,'import');
 assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id='live'").get().payload).messageStubType,1);
 assert.equal(db.prepare('SELECT last_message_preview FROM conversations').get().last_message_preview,'new');
 assert.equal(sends,0);await worker.stop();assert.equal(ended,1);
 assert.equal(db.prepare('SELECT lease_owner FROM connections').get().lease_owner,null);db.close();
});
test('revoked WhatsApp session recovery archives old auth and prepares a fresh QR without logging out',async()=>{
 const db=database(),dir=mkdtempSync(resolve(tmpdir(),'wis-worker-recovery-')),authDir=resolve(dir,'baileys-auth');
 mkdirSync(authDir,{recursive:true,mode:0o700});writeFileSync(resolve(authDir,'creds.json'),'private-revoked-session');
 db.prepare("UPDATE connections SET command='recover',status='disconnected',last_error='session_revoked' WHERE id='wis-5679'").run();
 const ev=new EventEmitter(),socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){}};
 const fake={default:()=>socket,useMultiFileAuthState:async path=>{assert.equal(readdirSync(path).length,0,'Baileys must receive a clean auth folder');return {state:{creds:{},keys:{}},saveCreds:async()=>{}};},makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir,mediaDir:resolve(dir,'media')});
 try{
  const archives=readdirSync(resolve(dir,'baileys-auth-revoked'));assert.equal(archives.length,1);
  assert.equal(readFileSync(resolve(dir,'baileys-auth-revoked',archives[0],'creds.json'),'utf8'),'private-revoked-session');
  assert.equal(db.prepare("SELECT status,last_error,command FROM connections WHERE id='wis-5679'").get().status,'qr_pending');
  ev.emit('connection.update',{qr:'fresh-test-qr'});
  assert.equal(db.prepare("SELECT qr_payload FROM connections WHERE id='wis-5679'").get().qr_payload,'fresh-test-qr');
  assert.equal(db.prepare("SELECT last_error FROM connections WHERE id='wis-5679'").get().last_error,null);
 }finally{await worker.stop();db.close();}
});
test('revoked session recovery drains delayed credential writes before rotating the auth directory',async()=>{
 const db=database(),dir=mkdtempSync(resolve(tmpdir(),'wis-worker-delayed-recovery-')),authDir=resolve(dir,'baileys-auth');
 mkdirSync(authDir,{recursive:true,mode:0o700});writeFileSync(resolve(authDir,'creds.json'),'private-revoked-session');
 db.prepare("UPDATE connections SET command='connect',status='disconnected',last_error=NULL WHERE id='wis-5679'").run();
 const ev=new EventEmitter(),socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){}};
 let releaseSave,saveStarted=false,authLoads=0;
 const fake={default:()=>socket,useMultiFileAuthState:async path=>{authLoads++;if(authLoads>1)assert.deepEqual(readdirSync(path),[],'fresh Baileys auth must not receive a late write from the rejected session');return {state:{creds:{},keys:{}},saveCreds:async()=>{saveStarted=true;await new Promise(resolve=>{releaseSave=resolve;});writeFileSync(resolve(authDir,'late-creds.json'),'late-private-write');}};},makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir,mediaDir:resolve(dir,'media')});
 try{
  ev.emit('creds.update');
  for(let i=0;i<50&&!saveStarted;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(saveStarted,true,'credential save should be in flight');
  db.prepare("UPDATE connections SET command='recover',status='disconnected',last_error='session_revoked' WHERE id='wis-5679'").run();
  await new Promise(resolve=>setTimeout(resolve,2200));
  assert.equal(existsSync(resolve(dir,'baileys-auth-revoked')),false,'auth rotation must wait for the in-flight save');
  assert.equal(authLoads,1,'new connection must not start while credential save is unresolved');
  releaseSave();
  for(let i=0;i<100&&authLoads<2;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(authLoads,2,'recovery should start a fresh Baileys session after the save drains');
  const archives=readdirSync(resolve(dir,'baileys-auth-revoked'));assert.equal(archives.length,1);
  const archived=resolve(dir,'baileys-auth-revoked',archives[0]);
  assert.equal(readFileSync(resolve(archived,'late-creds.json'),'utf8'),'late-private-write','the delayed rejected-session write must remain in the archive');
  assert.deepEqual(readdirSync(authDir),[],'the fresh auth directory must remain clean');
  assert.equal(db.prepare("SELECT status FROM connections WHERE id='wis-5679'").get().status,'qr_pending');
 }finally{releaseSave?.();await worker.stop();db.close();}
});
test('connection close diagnostic persists only a bounded code and allowlisted reason',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const ev=new EventEmitter(),dir=mkdtempSync(resolve(tmpdir(),'wis-worker-close-diagnostic-'));
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 try{ev.emit('connection.update',{connection:'open'});ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:440,message:'private provider details'}}}});const row=db.prepare("SELECT payload FROM snapshots WHERE kind='connection_diagnostics' AND resource_id='wis-5679'").get();const diagnostic=JSON.parse(row.payload);assert.equal(diagnostic.status_code,440);assert.equal(diagnostic.reason,'connection_replaced');assert.equal(typeof diagnostic.last_disconnect_at,'string');assert.equal(JSON.stringify(diagnostic).includes('private provider details'),false);}
 finally{await worker.stop();assert.equal(db.prepare("SELECT lease_owner FROM connections WHERE id='wis-5679'").get().lease_owner,null);db.close();}
});
test('catalog restarts a checked own-account read after settled public transport failures',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-public-test-'));const ev=new EventEmitter();let factories=0,recovered=false,publicError='public_catalog_unavailable',publicHttpTimeout=false,fallbackTimeout=false,publicDiscoveryTimeout=false,fallbackCalls=0,fallbackCollectionCalls=0,publicCollectionError=null,publicPageTwoFailure=false,publicCalls=0;
  const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){},getCatalog:async({jid,limit,cursor})=>{fallbackCalls++;if(fallbackTimeout)throw Error("read_timeout");assert.equal(jid,'5491111115679@s.whatsapp.net');assert.equal(limit,100);assert.equal(cursor,undefined);return {products:[{id:'own-product',name:'Owned product'}]};},getCollections:async(jid,limit)=>{fallbackCollectionCalls++;assert.equal(jid,'5491111115679@s.whatsapp.net');assert.equal(limit,100);return {collections:Array.from({length:60},(_,index)=>({id:index===0?'own-collection':`own-collection-${index+1}`,name:'Owned collection',products:[]}))};}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0,publicCatalogReaderFactory:({ownJid})=>{
  factories++;assert.equal(ownJid,'5491111115679@s.whatsapp.net');return {catalog:async({after}={})=>{if(recovered)return {products:[{product_id:'alias',name:'Recovered'}],truncated:true,paging:{after:null}};if(publicHttpTimeout)throw new PublicCatalogError('public_catalog_http_timeout');if(publicDiscoveryTimeout)throw new PublicCatalogError('read_timeout');if(publicPageTwoFailure){publicCalls++;if(after)return Promise.reject(Object.assign(Error('public_catalog_unavailable'),{code:'public_catalog_unavailable',provider_code:2498052}));return {products:[{product_id:'page-one',name:'Public page one'}],paging:{after:'public-cursor'}};}const error=Object.assign(Error(publicError),{code:publicError});if(publicError==='public_catalog_unavailable')error.provider_code=2498052;throw error;},collections:async()=>{if(publicCollectionError)throw publicCollectionError;return recovered?({collections:[{id:'new',products:[],products_collected:false,products_truncated:true}],truncated:true,paging:{after:null}}):({collections:[],paging:{after:null},response_verified:true});}};
 }});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  for(const kind of ['catalog','collections']){const now=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind,kind,'pending',now,now);await worker.drainReads();}
  const catalog=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload);
   assert.equal(catalog.available,true,JSON.stringify(catalog));assert.equal(catalog.scope,'own_account');assert.equal(catalog.known_only,false);assert.equal(catalog.source,'checked_baileys_iq_fallback');assert.equal(catalog.product_count,1);assert.equal(catalog.error,null);
   const owned=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='product' AND resource_id LIKE '%:own-product'").get().payload);assert.equal(owned.name,'Owned product');
   publicError='read_timeout';const timeoutAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('catalog-timeout','catalog','pending',timeoutAt,timeoutAt);await worker.drainReads();assert.equal(db.prepare("SELECT error FROM read_commands WHERE id='catalog-timeout'").get().error,'read_timeout');assert.equal(fallbackCalls,1);
  publicDiscoveryTimeout=true;const discoveryTimeoutAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('catalog-discovery-timeout','catalog','pending',discoveryTimeoutAt,discoveryTimeoutAt);await worker.drainReads();publicDiscoveryTimeout=false;assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='catalog-discovery-timeout'").get().status,'done');assert.equal(db.prepare("SELECT error FROM read_commands WHERE id='catalog-discovery-timeout'").get().error,null);assert.equal(fallbackCalls,2);const afterFallbackSuccess=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind=? AND resource_id=?").get("catalog","5491111115679@s.whatsapp.net").payload);assert.equal(afterFallbackSuccess.last_attempt_scope,'own_account');assert.equal(afterFallbackSuccess.last_attempt_source,'checked_baileys_iq_fallback');
  publicHttpTimeout=true;const httpTimeoutAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('catalog-http-timeout','catalog','pending',httpTimeoutAt,httpTimeoutAt);await worker.drainReads();publicHttpTimeout=false;assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='catalog-http-timeout'").get().status,'done');assert.equal(fallbackCalls,3);fallbackTimeout=true;publicHttpTimeout=true;const fallbackFailureAt=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)").run("catalog-fallback-timeout","catalog","pending",fallbackFailureAt,fallbackFailureAt);await worker.drainReads();fallbackTimeout=false;publicHttpTimeout=false;assert.equal(db.prepare("SELECT status FROM read_commands WHERE id=?").get("catalog-fallback-timeout").status,"failed");const fallbackFailedSnapshot=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind=? AND resource_id=?").get("catalog","5491111115679@s.whatsapp.net").payload);assert.equal(fallbackFailedSnapshot.scope,"own_account");assert.equal(fallbackFailedSnapshot.source,"checked_baileys_iq_fallback");assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id='5491111115679@s.whatsapp.net'").get().payload).scope,'own_account');
  const seededAt=new Date().toISOString();db.prepare("UPDATE snapshots SET payload=? WHERE kind='catalog' AND resource_id='5491111115679@s.whatsapp.net'").run(JSON.stringify({scope:'public_catalog',source:'public_whatsapp_graphql',available:true}));db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run('product','5491111115679@s.whatsapp.net:previous-public',JSON.stringify({id:'previous-public',owner_jid:'5491111115679@s.whatsapp.net',scope:'public_catalog'}),seededAt);
  publicPageTwoFailure=true;const pageTwoAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('catalog-page-two','catalog','pending',pageTwoAt,pageTwoAt);await worker.drainReads();assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='catalog-page-two'").get().status,'done');assert.equal(publicCalls,2);assert.equal(fallbackCalls,5);assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:page-one'").get(),undefined);assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:previous-public'").get(),undefined);assert.ok(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:own-product'").get());assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id='5491111115679@s.whatsapp.net'").get().payload).scope,'own_account');
  db.prepare("UPDATE snapshots SET payload=? WHERE kind='catalog' AND resource_id='5491111115679@s.whatsapp.net'").run(JSON.stringify({scope:'public_catalog',source:'public_whatsapp_graphql',available:true}));db.prepare("DELETE FROM snapshots WHERE kind='product' AND resource_id LIKE '%:own-product'").run();db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run('product','5491111115679@s.whatsapp.net:previous-public',JSON.stringify({id:'previous-public',owner_jid:'5491111115679@s.whatsapp.net',scope:'public_catalog'}),new Date().toISOString());db.exec("CREATE TRIGGER fail_catalog_insert BEFORE INSERT ON snapshots WHEN NEW.kind='product' AND NEW.resource_id LIKE '%:own-product' BEGIN SELECT RAISE(ABORT,'forced catalog insert failure'); END");
  const atomicAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('catalog-atomic-failure','catalog','pending',atomicAt,atomicAt);await worker.drainReads();db.exec('DROP TRIGGER fail_catalog_insert');assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='catalog-atomic-failure'").get().status,'failed');assert.ok(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:previous-public'").get());assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:own-product'").get(),undefined);const failedAtomic=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id='5491111115679@s.whatsapp.net'").get().payload);assert.equal(failedAtomic.scope,'public_catalog');assert.equal(failedAtomic.source,'public_whatsapp_graphql');assert.equal(failedAtomic.last_attempt_scope,'own_account');assert.equal(failedAtomic.last_attempt_source,'checked_baileys_iq_fallback');assert.equal(failedAtomic.available,false);assert.equal(failedAtomic.stale,true);
   const collections=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collections'").get().payload);
   assert.equal(collections.response_verified,true);assert.equal(collections.known_only,true);assert.equal(collections.collection_count,0);assert.equal(factories,1);
   const collectionNow=new Date().toISOString();db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run('collection','5491111115679@s.whatsapp.net:previous-public-collection',JSON.stringify({id:'previous-public-collection',owner_jid:'5491111115679@s.whatsapp.net',scope:'public_catalog',available:true}),collectionNow);db.exec("CREATE TRIGGER fail_collection_insert BEFORE INSERT ON snapshots WHEN NEW.kind='collection' AND NEW.resource_id LIKE '%:own-collection' BEGIN SELECT RAISE(ABORT,'forced collection insert failure'); END");
   publicCollectionError=new PublicCatalogError('public_catalog_http_timeout');const failedCollectionAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('collections-atomic-failure','collections','pending',failedCollectionAt,failedCollectionAt);await worker.drainReads();db.exec('DROP TRIGGER fail_collection_insert');assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='collections-atomic-failure'").get().status,'failed');assert.ok(db.prepare("SELECT 1 FROM snapshots WHERE kind='collection' AND resource_id LIKE '%:previous-public-collection'").get());assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='collection' AND resource_id LIKE '%:own-collection'").get(),undefined);const failedCollections=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collections' AND resource_id='5491111115679@s.whatsapp.net'").get().payload);assert.equal(failedCollections.scope,'public_catalog');assert.equal(failedCollections.source,'public_whatsapp_graphql');assert.equal(failedCollections.last_attempt_scope,'own_account');assert.equal(failedCollections.last_attempt_source,'checked_baileys_iq_fallback');assert.equal(failedCollections.available,false);assert.equal(failedCollections.stale,true);assert.equal(failedCollections.stale,true);
   const fallbackCollectionAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('collections-fallback','collections','pending',fallbackCollectionAt,fallbackCollectionAt);await worker.drainReads();assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='collections-fallback'").get().status,'done');assert.equal(fallbackCollectionCalls,2);const fallbackCollections=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collections' AND resource_id='5491111115679@s.whatsapp.net'").get().payload);assert.equal(fallbackCollections.scope,'own_account');assert.equal(fallbackCollections.source,'checked_baileys_iq_fallback');assert.equal(fallbackCollections.last_attempt_scope,'own_account');assert.equal(fallbackCollections.last_attempt_source,'checked_baileys_iq_fallback');assert.equal(fallbackCollections.collection_count,60);assert.equal(fallbackCollections.truncated,false);assert.equal(fallbackCollections.available,true);assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='collection' AND resource_id LIKE '5491111115679@s.whatsapp.net:%'").get().n,60);assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='collection' AND resource_id LIKE '%:previous-public-collection'").get(),undefined);
   publicCollectionError=new PublicCatalogError('access_denied');const rejectedCollectionAt=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('collections-access-denied','collections','pending',rejectedCollectionAt,rejectedCollectionAt);await worker.drainReads();assert.equal(db.prepare("SELECT error FROM read_commands WHERE id='collections-access-denied'").get().error,'access_denied');assert.equal(fallbackCollectionCalls,2);const staleCollections=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collections' AND resource_id='5491111115679@s.whatsapp.net'").get().payload);assert.equal(staleCollections.available,false);assert.equal(staleCollections.stale,true);assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='collection' AND json_extract(payload,'$.stale')=true").get().n,60);publicCollectionError=null;
  recovered=true;
  const now=new Date().toISOString();
  for(const kind of ['product','collection'])db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run(kind,'5491111115679@s.whatsapp.net:old','{}',now);
  for(const kind of ['catalog','collections']){db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind+'-recovered',kind,'pending',now,now);await worker.drainReads();}
  const recoveredCatalog=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload);
  assert.equal(recoveredCatalog.provider_code,null);assert.equal(recoveredCatalog.status_code,null);assert.equal(recoveredCatalog.truncated,true);
  assert.ok(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:alias'").get());
   assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE resource_id LIKE '%:old'").get().n,1);
  const nested=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collection' AND resource_id LIKE '%:new'").get().payload);
  assert.equal(nested.products_collected,false);assert.equal(nested.products_truncated,true);
 } finally {await worker.stop();db.close();}
});
test('newsletter invite lookup uses Baileys read metadata and never persists the invite code',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-newsletter-invite-worker-')),ev=new EventEmitter(),code='ChannelInvite_123';let calls=0;
 let emptyMetadata=false;const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},newsletterMetadata:async(type,key)=>{calls++;assert.equal(type,'invite');assert.equal(key,code);return emptyMetadata?null:{id:'12345@newsletter',name:'Canal',description:'Descripción',creation_time:1700000000,subscribers:42,verification:'VERIFIED',picture:{url:'https://cdn.invalid/?token=PRIVATE'},invite:code,owner:'private-owner'};}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});const result=await worker.lookupNewsletterByInviteCode(code);assert.equal(result.data.name,'Canal');assert.equal(result.data.subscribers_count,42);assert.equal(result.data.type,'newsletter');assert.equal(result.meta.partial,true);assert.equal(result.meta.available_fields.verification,true);assert.equal(JSON.stringify(result).includes(code),false);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(calls,1);assert.equal(db.prepare('SELECT count(*) n FROM read_commands WHERE target=?').get(code).n,0);assert.equal(db.prepare('SELECT count(*) n FROM snapshots WHERE payload LIKE ?').get('%'+code+'%').n,0);emptyMetadata=true;await assert.rejects(worker.lookupNewsletterByInviteCode(code),{message:'invalid_newsletter_metadata_response'});assert.equal(calls,2);await assert.rejects(worker.lookupNewsletterByInviteCode('https://whatsapp.com/channel/'+code),{message:'invalid_invite_code'});}
 finally{await worker.stop();db.close();}
});

test('known contact profile read captures verified WhatsApp status and Business fields without secrets',async()=>{
  const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-contact-profile-worker-')),ev=new EventEmitter(),jid='5491111112345@s.whatsapp.net';let writes=0,providerReads=0,failRefresh=false;
 db.prepare("INSERT INTO contacts(id,phone_e164,display_name,wa_jid,created_at) VALUES('known-contact','+5491111112345','Contacto',?,?)").run(jid,new Date().toISOString());
  const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},fetchStatus:async target=>{providerReads++;if(failRefresh)throw Object.assign(new Error('temporary'),{statusCode:503});return[{id:target,status:{status:'Disponible',setAt:1700000000,secret:'never-store'}}];},getBusinessProfile:async target=>{providerReads++;if(failRefresh)throw Object.assign(new Error('temporary'),{statusCode:503});return {wid:target,address:'Calle 123',description:'Atención comercial',email:'hola@example.test',category:'Retail',website:['https://example.test'],business_hours:{timezone:'America/Argentina/Buenos_Aires',business_config:[{day_of_week:'monday',mode:'specific_hours',open_time:540,close_time:1080,secret:'never-store'}]},privateKey:'never-store'};},sendMessage(){writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}},worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();const createdAt=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES('contact-profile-test','contact_profile',?,'pending',?,?)").run(jid,createdAt,createdAt);await worker.drainReads();const command=db.prepare("SELECT status,error FROM read_commands WHERE id='contact-profile-test'").get();assert.equal(command.status,'done',command.error);const result=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(jid).payload);assert.equal(result.status.available,true);assert.equal(result.status.status,'Disponible');assert.equal(result.status.available_fields.setAt,true);assert.equal(result.business_profile.available,true);assert.equal(result.business_profile.description,'Atención comercial');assert.equal(result.business_profile.business_hours.config[0].open_time,540);assert.equal(JSON.stringify(result).includes('never-store'),false);assert.equal(writes,0);const readsBeforeUnknown=providerReads,unknownAt=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES('contact-profile-unknown','contact_profile','5491111119999@s.whatsapp.net','pending',?,?)").run(unknownAt,unknownAt);await worker.drainReads();assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='contact-profile-unknown'").get().status,'failed');assert.equal(providerReads,readsBeforeUnknown);}
 finally{await worker.stop();db.close();}
});

test('temporary contact profile refresh failure preserves verified sections as stale',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-contact-profile-stale-')),ev=new EventEmitter(),jid='5491111112345@s.whatsapp.net';let fail=false,failStatus=false;
 db.prepare("INSERT INTO contacts(id,phone_e164,display_name,wa_jid,created_at) VALUES('known-contact','+5491111112345','Contacto',?,?)").run(jid,new Date().toISOString());
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},fetchStatus:async target=>{if(fail||failStatus)throw Object.assign(new Error('temporary'),{statusCode:503});return[{id:target,status:{status:'Disponible'}}];},getBusinessProfile:async target=>{if(fail)throw Object.assign(new Error('temporary'),{statusCode:503});return{wid:target,description:'Perfil verificado'};}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}},worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();const enqueue=async id=>{const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,'contact_profile',?,'pending',?,?)").run(id,jid,at,at);await worker.drainReads();};await enqueue('profile-success');fail=true;await enqueue('profile-temporary-failure');let row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(jid).payload);assert.equal(row.status.status,'Disponible');assert.equal(row.status.response_verified,true);assert.equal(row.status.stale,true);assert.equal(row.status.last_error,'provider_error');assert.equal(row.business_profile.description,'Perfil verificado');assert.equal(row.business_profile.response_verified,true);assert.equal(row.business_profile.stale,true);assert.equal(JSON.stringify(row).includes('temporary'),false);fail=false;failStatus=true;await enqueue('profile-mixed-refresh');row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(jid).payload);assert.equal(row.status.stale,true);assert.equal(row.business_profile.stale,false);assert.equal(row.business_profile.description,'Perfil verificado');}
 finally{await worker.stop();db.close();}
});

test('scheduled contact profile reads rotate through only three known contacts and never send',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-contact-profile-batch-')),ev=new EventEmitter(),own='5491111115679@s.whatsapp.net',targets=Array.from({length:4},(_,index)=>`549111111${String(index+1).padStart(4,'0')}@s.whatsapp.net`);let writes=0;const queried=[];
 for(let index=0;index<targets.length;index++)db.prepare('INSERT INTO contacts(id,phone_e164,display_name,wa_jid,created_at) VALUES(?,?,?,?,?)').run('known-'+index,'+549111111'+String(index+1).padStart(4,'0'),'Contacto '+index,targets[index],new Date(Date.UTC(2026,0,index+1)).toISOString());
 db.prepare('INSERT INTO contacts(id,phone_e164,display_name,wa_jid,created_at) VALUES(?,?,?,?,?)').run('known-device','+5491111110005','Contacto dispositivo','5491111110005:2@s.whatsapp.net','2025-12-31T00:00:00.000Z');db.prepare('INSERT INTO contacts(id,phone_e164,display_name,wa_jid,created_at) VALUES(?,?,?,?,?)').run('own-contact','+5491111115679','Cuenta propia',own,'2025-12-30T00:00:00.000Z');
 const socket={ev,user:{id:own},end(){},fetchStatus:async target=>{queried.push(target);return[{id:target,status:{status:'Disponible'}}];},getBusinessProfile:async target=>{queried.push(target);return {wid:target,description:'Perfil de prueba'};},sendMessage(){writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}},worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0});
  try{ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('contact-profiles-batch','contact_profiles','pending',?,?)").run(at,at);await worker.drainReads();const command=db.prepare("SELECT status,error FROM read_commands WHERE id='contact-profiles-batch'").get();assert.equal(command.status,'done',command.error);const batchQueries=queried.filter(target=>targets.includes(target));assert.equal(new Set(batchQueries).size,3);assert.equal(batchQueries.length,6);assert.equal(writes,0);const summary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact_profiles' AND resource_id='wis-5679'").get().payload);assert.equal(summary.checked_count,3);assert.equal(summary.verified_read_count,6);assert.equal(summary.partial,false);assert.equal(summary.complete,false);for(const target of targets.slice(0,3)){const payload=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(target).payload);assert.ok(payload.profile_read_at);assert.equal(payload.status.response_verified,true);assert.equal(payload.business_profile.response_verified,true);}assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='contact' AND resource_id=?").get(targets[3]),undefined);}
 finally{await worker.stop();db.close();}
});

test('avatar reads require known targets, cache metadata only, and preserve stale file on failure',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-avatar-worker-'));const ev=new EventEmitter();let calls=0,fail=false;
 const own='5491111115679@s.whatsapp.net';
 const socket={ev,user:{id:own},end(){},profilePictureUrl:async(target,type,timeout)=>{calls++;assert.equal(target,own);assert.equal(type,'preview');assert.equal(timeout,10000);return fail?undefined:'https://pps.whatsapp.net/image?token=SECRET';}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0,avatarCache:async(url,options)=>{assert.ok(options.authorized());assert.ok(url.includes('SECRET'));return {filename:'example.jpg',mime:'image/jpeg',size:4};}});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  const command=async(id,target)=>{const date=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'avatar',target,'pending',date,date);await worker.drainReads();};
  await command('unknown','123456789@s.whatsapp.net');assert.equal(calls,0);
  await command('own',own);let row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='avatar' AND resource_id=?").get(own).payload);assert.equal(row.available,true);assert.equal(JSON.stringify(row).includes('SECRET'),false);
  fail=true;await command('missing',own);row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='avatar' AND resource_id=?").get(own).payload);assert.equal(row.available,false);assert.equal(row.stale,true);assert.equal(row.filename,'example.jpg');assert.equal(row.error,'avatar_unavailable');
 } finally {await worker.stop();db.close();}
});

test('scheduled avatar reads rotate after failures, exclude own PN/LID and never send',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-avatar-scheduled-')),ev=new EventEmitter(),own='5491111115679@s.whatsapp.net',ownLid='5491111115680@lid',targets=['5491111111001@s.whatsapp.net','5491111111002@lid'];let writes=0,failFirst=true;const queried=[];
 for(const [id,jid,created] of [['device','5491111110999:2@s.whatsapp.net','2025-01-01T00:00:00.000Z'],['first',targets[0],'2026-01-01T00:00:00.000Z'],['second',targets[1],'2026-01-02T00:00:00.000Z'],['own',own,'2024-01-01T00:00:00.000Z'],['own-lid',ownLid,'2023-01-01T00:00:00.000Z']])db.prepare('INSERT INTO contacts(id,phone_e164,display_name,wa_jid,created_at) VALUES(?,?,?,?,?)').run(id,null,id,jid,created);
 const socket={ev,user:{id:own,lid:ownLid},end(){},profilePictureUrl:async(target,type,timeout)=>{queried.push(target);assert.equal(type,'preview');assert.equal(timeout,10000);if(failFirst){failFirst=false;return undefined;}return 'https://pps.whatsapp.net/image?token=SECRET';},sendMessage(){writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}},worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0,avatarCache:async(url,options)=>{assert.ok(options.authorized());assert.ok(url.includes('SECRET'));return {filename:'cached.jpg',mime:'image/jpeg',size:4};}});
 try{ev.emit('connection.update',{connection:'open'});await worker.drainReads();db.prepare('DELETE FROM read_commands').run();const enqueue=async id=>{const at=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,'avatars','pending',?,?)").run(id,at,at);await worker.drainReads();};await enqueue('avatars-first');let command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='avatars-first'").get();assert.equal(command.target,targets[0]);assert.equal(command.status,'failed');const failure=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='avatar' AND resource_id=?").get(targets[0]).payload);assert.equal(failure.available,false);assert.equal(failure.error,'avatar_unavailable');await enqueue('avatars-second');command=db.prepare("SELECT target,status,error FROM read_commands WHERE id='avatars-second'").get();assert.equal(command.target,targets[1]);assert.equal(command.status,'done',command.error);assert.deepEqual(queried,targets);const failed=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='avatar' AND resource_id=?").get(targets[0]).payload);assert.equal(failed.available,false);assert.equal(failed.stale,false);const row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='avatar' AND resource_id=?").get(targets[1]).payload);assert.equal(row.available,true);assert.equal(row.filename,'cached.jpg');assert.equal(JSON.stringify(row).includes('SECRET'),false);const summary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='avatars' AND resource_id='wis-5679'").get().payload);assert.equal(summary.checked_count,1);assert.equal(summary.known_contact_count,2);assert.equal(summary.unattempted_count,0);assert.equal(summary.complete,false);assert.equal(summary.partial,true);assert.equal(summary.failure_count,1);assert.equal(summary.available_count,1);assert.equal(summary.last_read_error,null);assert.equal(summary.scope,'known_contacts');assert.equal(writes,0);}
 finally{await worker.stop();db.close();}
});

test('observed calls merge durable chronological lifecycle without socket writes or secrets',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-calls-'));const ev=new EventEmitter();let writes=0;
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},rejectCall(){writes++;},sendMessage(){writes++;}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth')});
 try {
  const base={id:'call-one',from:'123@s.whatsapp.net',chatId:'123@s.whatsapp.net',isVideo:true,secret:'SECRET'};
  ev.emit('call',[{...base,status:'offer',date:new Date('2026-01-01T00:00:00Z')}]);
  ev.emit('call',[{id:base.id,status:'terminate',date:new Date('2026-01-01T00:00:02Z')}]);
  ev.emit('call',[{id:base.id,status:'ringing',date:new Date('2026-01-01T00:00:01Z')},{id:base.id,status:'ringing',date:new Date('2026-01-01T00:00:01Z')}]);
  const row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='call'").get().payload);
  assert.equal(row.status,'terminate');assert.equal(row.from,base.from);assert.equal(row.isVideo,true);assert.equal(row.date,'2026-01-01T00:00:02.000Z');assert.equal(row.history.length,3);assert.equal(JSON.stringify(row).includes('SECRET'),false);assert.equal(writes,0);
  ev.emit('call',[{id:'\ninvalid',status:'offer',date:new Date()}]);assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='call'").get().n,1);
 } finally {await worker.stop();db.close();}
});

test('observed identity mappings preserve conflicts without merging names or consent',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-lid-')),ev=new EventEmitter();
 const fake={default:()=>mockRawQueries({ev,user:{id:'5491111115679@s.whatsapp.net'},end(){}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth')});
 try {
  ev.emit('contacts.upsert',[{id:'5491111111111@s.whatsapp.net',name:'PN original'}]);
  db.prepare("UPDATE contacts SET consent_at='2026-01-01',consent_source='original',consent_scope='test'").run();
  ev.emit('lid-mapping.update',{lid:'100@lid',pn:'5491111111111@s.whatsapp.net',secret:'SECRET'});
  ev.emit('contacts.upsert',[{id:'100@lid',phoneNumber:'5491111111111@s.whatsapp.net',name:'Different name'}]);
  ev.emit('lid-mapping.update',{lid:'100@lid',pn:'5492222222222@s.whatsapp.net'});
  ev.emit('lid-mapping.update',{lid:'200@lid',pn:'5491111111111@s.whatsapp.net'});
  ev.emit('lid-mapping.update',{lid:'100@lid',pn:'5491111111111@s.whatsapp.net'});
  const identity=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='identity' AND resource_id='100@lid'").get().payload);
  assert.equal(identity.pn,'5491111111111@s.whatsapp.net');assert.equal(identity.status,'conflict');assert.equal(identity.conflicting_pn,'5492222222222@s.whatsapp.net');assert.equal(JSON.stringify(identity).includes('SECRET'),false);
  assert.deepEqual(identity.candidate_pns,['5491111111111@s.whatsapp.net','5492222222222@s.whatsapp.net']);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='identity' AND resource_id='200@lid'").get().payload).conflict,true);
  const pn=db.prepare("SELECT * FROM contacts WHERE wa_jid='5491111111111@s.whatsapp.net'").get(),lid=db.prepare("SELECT * FROM contacts WHERE wa_jid='100@lid'").get();assert.equal(pn.display_name,'PN original');assert.equal(pn.consent_source,'original');assert.equal(lid.phone_e164,null);assert.equal(lid.consent_at,null);
  ev.emit('lid-mapping.update',{lid:'300@lid',pn:'300@lid'});assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='identity'").get().n,2);
 } finally {await worker.stop();db.close();}
});

test('startup recovers explicit cached contact pairs once without new provider observations',async()=>{
 const db=database(),date='2026-01-01T00:00:00.000Z',dir=mkdtempSync(resolve(tmpdir(),'wis-recover-lid-'));
 for(const [id,data] of [['100@lid',{lid:'100@lid',phoneNumber:'5491111111111@s.whatsapp.net'}],['200@lid',{lid:'200@lid',phoneNumber:'5491111111111@s.whatsapp.net'}],['300@lid',{lid:'300@lid'}]])db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('contact',id,JSON.stringify(data),date);
 const fake={default(){throw Error('no socket');},useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({})};
 const options={db,baileys:fake,logger:{},authDir:resolve(dir,'auth')};const first=await runWorker(options);await first.stop();
 const rows=db.prepare("SELECT payload FROM snapshots WHERE kind='identity' ORDER BY resource_id").all();assert.equal(rows.length,2);for(const row of rows){const v=JSON.parse(row.payload);assert.equal(v.observed_at,date);assert.equal(v.conflict,true);}
 const second=await runWorker(options);await second.stop();assert.deepEqual(db.prepare("SELECT payload FROM snapshots WHERE kind='identity' ORDER BY resource_id").all(),rows);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get().n,0);db.close();
});

test('received stories expire, deduplicate and cannot resurrect after revocation',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-stories-')),ev=new EventEmitter();let writes=0;
 const fake={default:()=>mockRawQueries({ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},readMessages(){writes++;},sendMessage(){writes++;}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth')});
 const message=(id,seconds)=>({key:{id,remoteJid:'status@broadcast',participant:'123@s.whatsapp.net'},messageTimestamp:seconds,message:{conversation:'ephemeral test'}});
 const flush=()=>new Promise(r=>setTimeout(r,20));
 try {
  const current=Math.floor(Date.now()/1000);ev.emit('messages.upsert',{messages:[message('active',current),message('active',current),message('expired',current-90000),message('invalid',0),message('future-date',current+86400000)]});await flush();
  assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='story'").get().n,2);assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='story' AND resource_id LIKE '%:expired'").get().payload).body,null);
  ev.emit('messages.delete',{keys:[{...message('active',current).key,participant:'invalid'}]});await flush();assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='story_revocation'").get().n,0);assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='story' AND resource_id LIKE '%:active'").get().payload).revoked,false);
  ev.emit('messages.delete',{keys:[message('active',current).key,message('future',current).key]});await flush();ev.emit('messages.upsert',{messages:[message('active',current),message('future',current)]});await flush();
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='story' AND resource_id LIKE '%:active'").get().payload).body,null);assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='story'").get().n,2);assert.equal(writes,0);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
 } finally {await worker.stop();db.close();}
});

test('passive join events retain bounded observations and never claim current pending membership',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();const dir=mkdtempSync(resolve(tmpdir(),'wis-join-events-')),ev=new EventEmitter();let writes=0;
 const fake={default:()=>mockRawQueries({ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},groupRequestParticipantsUpdate(){writes++;}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth')});
 try {
  const base={id:'123@g.us',participant:'456@lid',participantPn:'5491111111111@s.whatsapp.net',author:'789@lid',method:'invite_link',inviteCode:'SECRET'};
  ev.emit('group.join-request',{...base,action:'created'});ev.emit('group.join-request',{...base,action:'revoked'});
  const row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_join_event'").get().payload);assert.equal(row.group_id,base.id);assert.equal(row.action,'revoked');assert.equal(row.history.length,2);assert.equal(row.source,'group.join-request');assert.ok(Date.parse(row.observed_at));assert.equal(row.pending,undefined);assert.equal(JSON.stringify(row).includes('SECRET'),false);assert.equal(writes,0);
  ev.emit('group.join-request',{...base,participant:'https://invalid',action:'created'});assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='group_join_event'").get().n,1);
  ev.emit('group.join-request',{id:base.id,participant:base.participant,action:'created'});const latest=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_join_event'").get().payload);assert.equal(latest.author,null);assert.equal(latest.participantPn,null);assert.equal(latest.authorPn,null);assert.equal(latest.method,null);assert.equal(latest.history.length,3);
 } finally {await worker.stop();db.close();}
});

test('late provider failure is correlated and sanitized after local read timeout',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-late-test-'));const ev=new EventEmitter();let fail;
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},getCatalog:()=>new Promise((_,reject)=>{fail=reject;})};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readTimeoutMs:10,readIntervalMs:0});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('catalog-test','catalog','pending',?,?)").run(now,now);
  await worker.drainReads();assert.equal(db.prepare("SELECT error FROM read_commands WHERE id='catalog-test'").get().error,'read_timeout');
  fail(Object.assign(Error('secret provider payload'),{output:{statusCode:403}}));await new Promise(resolve=>setTimeout(resolve,0));
  const data=JSON.parse(db.prepare("SELECT payload FROM events WHERE kind='read.late_failed'").get().payload);
  assert.equal(data.command_id,'catalog-test');assert.equal(data.method,'getCatalog');assert.equal(data.error,'access_denied');assert.equal(data.status_code,403);
  assert.equal(JSON.stringify(data).includes('secret'),false);
 } finally {await worker.stop();db.close();}
});

test('Business, privacy, community and known-newsletter reads are bounded and strip secrets',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-catalog-test-'));const ev=new EventEmitter();
 let catalogCalls=0,newsletterCalls=0,empty=false,failReads=false,failFirstNewsletter=false,emptyNewsletterResponses=false,mismatchNewsletter=false,communityMode='one',badCommunityMetadata=false,mismatchCommunityMetadata=false,linkedGroupCalls=0,invalidSubscriberCount=false,failAdminCount=false;const communityTargets=[];const own='5491111115679@s.whatsapp.net';
 const socket={ev,user:{id:own},end(){},
  getCatalog:async options=>{if(failReads)throw Error('remote secret');assert.equal(options.jid,own);assert.equal(options.limit,100);catalogCalls++;return {products:empty?[]:Array.from({length:100},(_,i)=>({id:`${catalogCalls}-${i}`,name:'Product',price:1000,currency:'ARS',description:'Description',imageUrls:{original:'signed-secret'},privateKey:'never-store'})),nextPageCursor:empty?undefined:'cursor-'+catalogCalls};},
  getCollections:async(jid,limit)=>{assert.equal(jid,own);assert.equal(limit,100);return {collections:[{id:'c',name:'Collection',products:[{id:'p',name:'Product',price:10,currency:'ARS',secret:'never-store'}],status:{status:'APPROVED',canAppeal:false,secret:'never-store'}}]};},
  fetchBlocklist:async()=>['123456789@s.whatsapp.net',null,'invalid'],
  communityFetchAllParticipating:async()=>{if(failReads)throw Error('remote secret');return communityMode==='empty'?{}:communityMode==='many'?Object.fromEntries(Array.from({length:2001},(_,i)=>[`${1000+i}@g.us`,{id:`${1000+i}@g.us`,isCommunity:true,subject:'Large community'}])):{'123@g.us':{id:'123@g.us',isCommunity:true,subject:'Community',inviteCode:'never-store'}};},
  communityMetadata:async id=>badCommunityMetadata?{id,isCommunity:true,linkedParent:'invalid',subject:'Community'}:{id:mismatchCommunityMetadata?'999@g.us':id,isCommunity:true,linkedParent:'777@g.us',subject:'Community',inviteCode:'never-store'},
  communityFetchLinkedGroups:async id=>{linkedGroupCalls++;communityTargets.push(id);return {communityJid:id,isCommunity:true,linkedGroups:[{id:'456@g.us',subject:'Linked',size:3,secret:'never-store'}]};},
  newsletterMetadata:async(type,id)=>{newsletterCalls++;assert.equal(type,'jid');if(failFirstNewsletter&&id==='123@newsletter'){failFirstNewsletter=false;throw Error('provider failure secret');}if(emptyNewsletterResponses)return null;return {id:mismatchNewsletter&&id==='123@newsletter'?'999@newsletter':id,name:'Channel',subscribers:7,invite:'never-store',picture:{id:'image',mediaKey:'never-store',directPath:'signed-secret'}};},
  newsletterSubscribers:async id=>{assert.equal(id,'123@newsletter');return {subscribers:invalidSubscriberCount?'unknown':42};},
  newsletterAdminCount:async id=>{assert.equal(id,'123@newsletter');if(failAdminCount)throw Error('private provider detail');return 2;},
  sendMessage(){throw Error('mutation forbidden');},productCreate(){throw Error('mutation forbidden');}
 };
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readIntervalMs:0});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();let n=0;
  const command=async(kind,target=null)=>{const id=String(++n);const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)").run(id,kind,target,now,now);await worker.drainReads();return db.prepare('SELECT status FROM read_commands WHERE id=?').get(id).status;};
  assert.equal(await command('newsletters'),'done');const noKnownNewsletters=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletters'").get().payload);assert.equal(noKnownNewsletters.available,true);assert.equal(noKnownNewsletters.response_verified,false);assert.equal(noKnownNewsletters.attempted_count,0);assert.equal(noKnownNewsletters.partial,true);assert.equal(noKnownNewsletters.complete,false);
  ev.emit('chats.upsert',[{id:'123@newsletter',name:'Channel'},{id:'456@newsletter',name:'Second Channel'}]);
  for(const kind of ['catalog','collections','blocklist','communities'])assert.equal(await command(kind),'done');
  failFirstNewsletter=true;assert.equal(await command('newsletters'),'done');
  assert.equal(await command('newsletter_counts','123@newsletter'),'done');let newsletterCounts=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter_counts' AND resource_id='123@newsletter'").get().payload);assert.equal(newsletterCounts.available,true);assert.equal(newsletterCounts.response_verified,true);assert.equal(newsletterCounts.fields.subscribers.value,42);assert.equal(newsletterCounts.fields.admin_count.value,2);assert.equal(await command('newsletter_counts','999@newsletter'),'failed');
  invalidSubscriberCount=true;failAdminCount=true;assert.equal(await command('newsletter_counts','123@newsletter'),'failed');newsletterCounts=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter_counts' AND resource_id='123@newsletter'").get().payload);assert.equal(newsletterCounts.available,false);assert.equal(newsletterCounts.response_verified,false);assert.equal(newsletterCounts.fields.subscribers.stale,true);assert.equal(newsletterCounts.fields.subscribers.value,42);assert.equal(newsletterCounts.fields.admin_count.stale,true);assert.equal(newsletterCounts.fields.admin_count.value,2);assert.equal(JSON.stringify(newsletterCounts).includes('private provider detail'),false);invalidSubscriberCount=false;failAdminCount=false;
  assert.equal(await command('newsletter_counts','123@newsletter'),'done');
  assert.equal(await command('community','123@g.us'),'done');
  const communitySnapshot=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='community' AND resource_id='123@g.us'").get().payload);assert.equal(communitySnapshot.community_jid,'777@g.us');assert.equal(communitySnapshot.is_community,true);assert.deepEqual(communityTargets,['777@g.us']);assert.equal(communitySnapshot.linked_groups[0].id,'456@g.us');assert.equal(JSON.stringify(communitySnapshot).includes('never-store'),false);
  badCommunityMetadata=true;assert.equal(await command('community','123@g.us'),'failed');assert.deepEqual(communityTargets,['777@g.us']);badCommunityMetadata=false;
  mismatchCommunityMetadata=true;assert.equal(await command('community','123@g.us'),'failed');assert.deepEqual(communityTargets,['777@g.us']);mismatchCommunityMetadata=false;
  assert.equal(catalogCalls,3);assert.equal(newsletterCalls,2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='product'").get().n,300);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload).truncated,true);
  assert.deepEqual(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='blocklist'").get().payload).ids,['123456789@s.whatsapp.net']);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='community'").get().payload).linked_groups[0].subject,'Linked');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter' AND resource_id='456@newsletter'").get().payload).subscribers,7);
  const failedNewsletter=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter' AND resource_id='123@newsletter'").get().payload);assert.equal(failedNewsletter.available,false);assert.equal(failedNewsletter.error,'read_failed');
  const newsletterSummary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletters'").get().payload);assert.equal(newsletterSummary.count,1);assert.equal(newsletterSummary.attempted_count,2);assert.equal(newsletterSummary.failure_count,1);assert.equal(newsletterSummary.partial,true);assert.equal(newsletterSummary.complete,false);
  assert.equal(await command('newsletters'),'done');const recoveredNewsletter=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter' AND resource_id='123@newsletter'").get().payload);assert.equal(recoveredNewsletter.available,true);assert.equal(recoveredNewsletter.response_verified,true);const recoveredSummary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletters'").get().payload);assert.equal(recoveredSummary.failure_count,0);assert.equal(recoveredSummary.complete,true);
  emptyNewsletterResponses=true;assert.equal(await command('newsletters'),'failed');const failedSummary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletters'").get().payload);assert.equal(failedSummary.error,'invalid_response');assert.equal(failedSummary.failure_count,2);emptyNewsletterResponses=false;
  mismatchNewsletter=true;assert.equal(await command('newsletters'),'done');const mismatchedNewsletter=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter' AND resource_id='123@newsletter'").get().payload);assert.equal(mismatchedNewsletter.available,false);assert.equal(mismatchedNewsletter.error,'invalid_response');assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter' AND resource_id='456@newsletter'").get().payload).available,true);const mismatchSummary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletters'").get().payload);assert.equal(mismatchSummary.failure_count,1);assert.equal(mismatchSummary.partial,true);mismatchNewsletter=false;
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE payload LIKE '%never-store%' OR payload LIKE '%signed-secret%'").get().n,0);
  failReads=true;assert.equal(await command('catalog'),'failed');assert.equal(await command('communities'),'failed');
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='product'").get().n,300);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='community'").get().n,1);
  const failedCatalog=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload);
  assert.equal(failedCatalog.available,false);assert.equal(failedCatalog.stale,true);assert.ok(failedCatalog.last_attempt_at);assert.ok(failedCatalog.last_success_at);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE payload LIKE '%remote secret%'").get().n,0);
  failReads=false;communityMode='many';assert.equal(await command('communities'),'done');
  assert.ok(db.prepare("SELECT 1 FROM snapshots WHERE kind='community' AND resource_id='123@g.us'").get(),'truncated result must preserve previous members');
  communityMode='empty';assert.equal(await command('communities'),'done');
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='community'").get().n,0);
  const communities=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='communities'").get().payload);
  assert.equal(communities.available,true);assert.equal(communities.stale,false);assert.equal(communities.count,0);
  assert.equal(await command('newsletter','999@newsletter'),'failed');assert.equal(newsletterCalls,8);
  empty=true;assert.equal(await command('catalog'),'done');
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='product'").get().n,0);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload).product_count,0);
 } finally {await worker.stop();db.close();}
});

test('collection fallback failures report the Baileys attempt scope',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-collection-fallback-'));const ev=new EventEmitter();const own='5491111115679@s.whatsapp.net';
 const socket={ev,user:{id:own},end(){},getCollections:async()=>{throw Error('private provider details');}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readIntervalMs:0,publicCatalogReaderFactory:()=>({collections:async()=>{throw new PublicCatalogError('public_catalog_http_timeout');}})});
 try{ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('collections-fallback','collections','pending',?,?)").run(now,now);await worker.drainReads();const summary=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collections'").get().payload);assert.equal(summary.error,'read_failed');assert.equal(summary.last_attempt_scope,'own_account');assert.equal(summary.last_attempt_source,'checked_baileys_iq_fallback');assert.equal(JSON.stringify(summary).includes('private provider details'),false);}finally{await worker.stop();db.close();}
});
test('history requests use oldest persisted key and milliseconds, and only exact arrival correlation changes request state',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-history-request-'));const ev=new EventEmitter();let calls=0;
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},fetchMessageHistory:async(count,key,ms)=>{calls++;assert.equal(count,50);assert.deepEqual(key,{remoteJid:'123@g.us',id:'oldest',fromMe:false});assert.equal(ms,1700000000000);return 'request-history-1';},sendMessage(){throw Error('chat send forbidden');},readMessages(){throw Error('read receipt forbidden');}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readIntervalMs:0});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  ev.emit('messages.upsert',{messages:[{key:{id:'oldest',remoteJid:'123@g.us'},messageTimestamp:1700000000,message:{conversation:'oldest'}}]});
  await new Promise(r=>setTimeout(r,0));
  const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES('history-test','history','123@g.us','pending',?,?)").run(now,now);
  await worker.drainReads();assert.equal(calls,1);
  const request=()=>JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='history_request' AND resource_id='history-test'").get().payload);
  assert.equal(request().status,'requested');assert.equal(request().complete,false);
  ev.emit('messaging-history.set',{messages:[],peerDataRequestSessionId:'different-request'});assert.equal(request().status,'requested');
  ev.emit('messaging-history.set',{messages:[{key:{id:'older',remoteJid:'123@g.us'},messageTimestamp:1690000000,message:{conversation:'older'}}],peerDataRequestSessionId:'request-history-1'});
  await new Promise(r=>setTimeout(r,0));assert.equal(request().status,'arrived');assert.equal(request().received_count,1);assert.equal(request().complete,false);
  assert.equal(db.prepare("SELECT source FROM messages WHERE wa_message_id='older'").get().source,'import');
  assert.equal(db.prepare('SELECT last_message_preview FROM conversations').get().last_message_preview,'oldest');
 } finally {await worker.stop();db.close();}
});
test('quotes, mentions, reactions, receipts, edits and revokes persist safe metadata without WA writes',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-message-meta-'));const ev=new EventEmitter();
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},sendMessage(){throw Error('no sends');}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  const key={id:'m',remoteJid:'123@g.us'};
  ev.emit('messages.upsert',{messages:[{key,messageTimestamp:1700000000,message:{extendedTextMessage:{text:'Original',contextInfo:{stanzaId:'quoted',participant:'111@lid',mentionedJid:['222@lid'],quotedMessage:{imageMessage:{caption:'Quoted image',mediaKey:'never-store'}},secret:'never-store'}}}}]});
  await new Promise(r=>setTimeout(r,0));
  const metadata=()=>JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id='m'").get().payload);
  assert.equal(metadata().quote.stanzaId,'quoted');assert.equal(metadata().quote.body_preview,'Quoted image');assert.deepEqual(metadata().mentions,['222@lid']);
  ev.emit('messages.reaction',[{key,reaction:{text:'👍',senderTimestampMs:1700000001000,key:{participant:'222@lid'},secret:'never-store'}}]);
  ev.emit('message-receipt.update',[{key,receipt:{userJid:'222@lid',readTimestamp:1700000002,secret:'never-store'}}]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='reaction'").get().n,1);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='receipt'").get().payload).readTimestamp,1700000002);
  ev.emit('messages.update',[{key,update:{message:{editedMessage:{message:{conversation:'Edited'}}},messageTimestamp:1700000003}}]);
  await new Promise(r=>setTimeout(r,0));assert.equal(db.prepare("SELECT body FROM messages WHERE wa_message_id='m'").get().body,'Edited');assert.equal(metadata().edited,true);
  ev.emit('messages.update',[{key,update:{message:null,messageStubType:1}}]);
  await new Promise(r=>setTimeout(r,0));assert.equal(db.prepare("SELECT body FROM messages WHERE wa_message_id='m'").get().body,null);assert.equal(metadata().revoked,true);
  assert.equal(db.prepare('SELECT last_message_preview FROM conversations').get().last_message_preview,'Mensaje eliminado');
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE payload LIKE '%never-store%'").get().n,0);
 } finally {await worker.stop();db.close();}
});
