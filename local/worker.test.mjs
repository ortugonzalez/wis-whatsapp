import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {timestamp,identityMatches,acquireLease,mediaFile,runWorker,safeGroup,normalizeContent} from './worker.mjs';
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.prepare("INSERT INTO connections(id,status,updated_at) VALUES('wis-5679','disconnected',?)").run(new Date().toISOString());return db;}
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
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
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
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),readTimeoutMs:10});
 try {
  ev.emit('connection.update',{connection:'open'});await worker.drainReads();
  assert.equal(reads,1);
  assert.equal(db.prepare("SELECT status FROM read_commands WHERE kind='all'").get().status,'failed');
  db.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('next','groups','pending',?,?)").run(new Date().toISOString(),new Date().toISOString());
  await new Promise(resolve=>setTimeout(resolve,2050));await worker.drainReads();
  assert.equal(reads,1);assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='next'").get().status,'pending');
  finish([]);await new Promise(resolve=>setTimeout(resolve,0));await worker.drainReads();
  assert.equal(reads,2);assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='next'").get().status,'done');
 } finally {if(finish)finish([]);await worker.stop();db.close();}
});
test('mock socket QR, persistent incoming history, no sends and graceful lease release',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const ev=new EventEmitter();let sends=0,ended=0;
 const dir=mkdtempSync(resolve(tmpdir(),'wis-worker-test-'));
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){ended++;},sendMessage(){sends++;throw Error('no send allowed');}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
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
