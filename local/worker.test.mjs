import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {timestamp,identityMatches,acquireLease,mediaFile,runWorker,safeGroup,normalizeContent,classifyReadError,readBudgetMs,checkedBusinessRead,checkedListRead,callSnapshot,checkedGroupRead,checkedAccountLimits} from './worker.mjs';

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
 const empty=await checkedBusinessRead({query:async(node,timeout)=>{assert.equal(timeout,30000);assert.equal(node.attrs.type,'get');return iq('product_catalog');}},'getCatalog',args);
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
test('checked Business reads use 35 second local budget and 30 second provider timeout',()=>{
 assert.equal(readBudgetMs('getCatalog'),35000);assert.equal(readBudgetMs('getCollections'),35000);
 for(const method of ['fetchStatus','fetchPrivacySettings','groupMetadata','newsletterMetadata'])assert.equal(readBudgetMs(method),12000);
 assert.equal(readBudgetMs('getCatalog',10),10);assert.equal(readBudgetMs('fetchStatus',10),10);
 assert.throws(()=>readBudgetMs('getCatalog',Infinity),/invalid_read_timeout/);
 assert.throws(()=>readBudgetMs('getCatalog',75001),/invalid_read_timeout/);
});
test('read error classification exposes only allowlisted code and safe HTTP integer',()=>{
 for(const [error,code,status] of [
  [Error('read_timeout'),'read_timeout',null],
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
 const result=safeGroup({id:'123@g.us',subject:'Test',inviteCode:'secret',noiseKey:'secret',participants:[{id:'123@lid',admin:'admin',privateKey:'secret'}]});
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(result.participants[0].admin,'admin');
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
  ev.emit('presence.update',{id:'555@lid',presences:{'555@lid':{lastKnownPresence:'available',lastSeen:123,secret:'never-store'}}});
  await worker.drainReads();
  const profile=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='profile'").get().payload);
  assert.equal(profile.name,'Owner');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='status'").get().payload).items[0].status.setAt,'2026-01-01T00:00:00.000Z');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='business'").get().payload).business_hours.config[0].open_time,540);
  const contact=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact'").get().payload);
  assert.equal(contact.name,'Saved Name');assert.equal(contact.notify,'Push Name');
  assert.equal(db.prepare("SELECT display_name FROM contacts").get().display_name,'Saved Name');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group'").get().payload).subject,'Group');
  assert.equal(db.prepare("SELECT status FROM read_commands WHERE kind='all'").get().status,'done');
  assert.equal(db.prepare("SELECT payload FROM snapshots WHERE kind='chat' AND resource_id='555@lid'").get().payload.includes('tcToken'),false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE payload LIKE '%never-store%'").get().n,0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM events WHERE payload LIKE '%never-store%'").get().n,0);
  assert.equal(reads,4);assert.equal(writes,0);
 } finally {await worker.stop();db.close();}
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
 ev.emit('messages.upsert',{messages:[{key:{id:'live',remoteJid:'123@g.us'},messageTimestamp:1700000001,message:{conversation:'new'}}]});
 ev.emit('messaging-history.set',{messages:[{key:{id:'old',remoteJid:'123@g.us'},messageTimestamp:1700000000,message:{conversation:'old'}}]});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n,2);
 assert.equal(db.prepare("SELECT source FROM messages WHERE wa_message_id='old'").get().source,'import');
 assert.equal(db.prepare('SELECT last_message_preview FROM conversations').get().last_message_preview,'new');
 assert.equal(sends,0);await worker.stop();assert.equal(ended,1);
 assert.equal(db.prepare('SELECT lease_owner FROM connections').get().lease_owner,null);db.close();
});
test('public reader uses own identity, verified public scope and safe unavailable classification',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const dir=mkdtempSync(resolve(tmpdir(),'wis-public-test-'));const ev=new EventEmitter();let factories=0,recovered=false;
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){}};
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0,publicCatalogReaderFactory:({ownJid})=>{
  factories++;assert.equal(ownJid,'5491111115679@s.whatsapp.net');return {catalog:async()=>{if(recovered)return {products:[{product_id:'alias',name:'Recovered'}],truncated:true,paging:{after:null}};throw Object.assign(Error('public_catalog_unavailable'),{provider_code:2498052});},collections:async()=>recovered?({collections:[{id:'new',products:[],products_collected:false,products_truncated:true}],truncated:true,paging:{after:null}}):({collections:[],paging:{after:null},response_verified:true})};
 }});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  for(const kind of ['catalog','collections']){const now=new Date().toISOString();db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind,kind,'pending',now,now);await worker.drainReads();}
  const catalog=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload);
  assert.equal(catalog.available,false);assert.equal(catalog.error,'public_catalog_unavailable');assert.equal(catalog.provider_code,2498052);
  const collections=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collections'").get().payload);
  assert.equal(collections.response_verified,true);assert.equal(collections.known_only,true);assert.equal(collections.collection_count,0);assert.equal(factories,1);
  recovered=true;
  const now=new Date().toISOString();
  for(const kind of ['product','collection'])db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run(kind,'5491111115679@s.whatsapp.net:old','{}',now);
  for(const kind of ['catalog','collections']){db.prepare('INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind+'-recovered',kind,'pending',now,now);await worker.drainReads();}
  const recoveredCatalog=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload);
  assert.equal(recoveredCatalog.provider_code,null);assert.equal(recoveredCatalog.status_code,null);assert.equal(recoveredCatalog.truncated,true);
  assert.ok(db.prepare("SELECT 1 FROM snapshots WHERE kind='product' AND resource_id LIKE '%:alias'").get());
  assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE resource_id LIKE '%:old'").get().n,2);
  const nested=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='collection' AND resource_id LIKE '%:new'").get().payload);
  assert.equal(nested.products_collected,false);assert.equal(nested.products_truncated,true);
 } finally {await worker.stop();db.close();}
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
 let catalogCalls=0,newsletterCalls=0,empty=false,failReads=false,communityMode='one';const own='5491111115679@s.whatsapp.net';
 const socket={ev,user:{id:own},end(){},
  getCatalog:async options=>{if(failReads)throw Error('remote secret');assert.equal(options.jid,own);assert.equal(options.limit,100);catalogCalls++;return {products:empty?[]:Array.from({length:100},(_,i)=>({id:`${catalogCalls}-${i}`,name:'Product',price:1000,currency:'ARS',description:'Description',imageUrls:{original:'signed-secret'},privateKey:'never-store'})),nextPageCursor:empty?undefined:'cursor-'+catalogCalls};},
  getCollections:async(jid,limit)=>{assert.equal(jid,own);assert.equal(limit,100);return {collections:[{id:'c',name:'Collection',products:[{id:'p',name:'Product',price:10,currency:'ARS',secret:'never-store'}],status:{status:'APPROVED',canAppeal:false,secret:'never-store'}}]};},
  fetchBlocklist:async()=>['123456789@s.whatsapp.net',null,'invalid'],
  communityFetchAllParticipating:async()=>{if(failReads)throw Error('remote secret');return communityMode==='empty'?{}:communityMode==='many'?Object.fromEntries(Array.from({length:2001},(_,i)=>[`${1000+i}@g.us`,{id:`${1000+i}@g.us`,isCommunity:true,subject:'Large community'}])):{'123@g.us':{id:'123@g.us',isCommunity:true,subject:'Community',inviteCode:'never-store'}};},
  communityMetadata:async id=>({id,isCommunity:true,subject:'Community',inviteCode:'never-store'}),
  communityFetchLinkedGroups:async id=>({communityJid:id,isCommunity:true,linkedGroups:[{id:'456@g.us',subject:'Linked',size:3,secret:'never-store'}]}),
  newsletterMetadata:async(type,id)=>{newsletterCalls++;assert.equal(type,'jid');return {id,name:'Channel',subscribers:7,invite:'never-store',picture:{id:'image',mediaKey:'never-store',directPath:'signed-secret'}};},
  sendMessage(){throw Error('mutation forbidden');},productCreate(){throw Error('mutation forbidden');}
 };
 const fake={default:()=>mockRawQueries(socket),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readIntervalMs:0});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  ev.emit('chats.upsert',[{id:'123@newsletter',name:'Channel'}]);let n=0;
  const command=async(kind,target=null)=>{const id=String(++n);const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)").run(id,kind,target,now,now);await worker.drainReads();return db.prepare('SELECT status FROM read_commands WHERE id=?').get(id).status;};
  for(const kind of ['catalog','collections','blocklist','communities','newsletters'])assert.equal(await command(kind),'done');
  assert.equal(await command('community','123@g.us'),'done');
  assert.equal(catalogCalls,3);assert.equal(newsletterCalls,1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='product'").get().n,300);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload).truncated,true);
  assert.deepEqual(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='blocklist'").get().payload).ids,['123456789@s.whatsapp.net']);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='community'").get().payload).linked_groups[0].subject,'Linked');
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='newsletter'").get().payload).subscribers,7);
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
  assert.equal(await command('newsletter','999@newsletter'),'failed');assert.equal(newsletterCalls,1);
  empty=true;assert.equal(await command('catalog'),'done');
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind='product'").get().n,0);
  assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog'").get().payload).product_count,0);
 } finally {await worker.stop();db.close();}
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
