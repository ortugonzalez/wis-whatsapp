import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {runWorker,classifyReadError} from '../../local/worker.mjs';

test('QA: provider messages matching Object prototype keys still yield safe error codes',()=>{
 for(const message of ['__proto__','constructor','toString','hasOwnProperty'])assert.deepEqual(classifyReadError({message,statusCode:403}),{code:'access_denied',status_code:403});
});

function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../../local/schema.sql',import.meta.url),'utf8'));db.prepare("INSERT INTO connections(id,status,command,updated_at) VALUES('wis-5679','disconnected','connect',?)").run(new Date().toISOString());return db;}
test('QA: LID messages persist and receipt statuses fit the current SQLite contract',async()=>{
 const db=database(),ev=new EventEmitter(),dir=mkdtempSync(resolve(tmpdir(),'wis-qa-'));
 const fake={default:()=>({ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 try{
  ev.emit('messages.upsert',{messages:[{key:{id:'qa-lid',remoteJid:'123456@lid'},messageTimestamp:1700000000,message:{conversation:'fixture'}}]});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(db.prepare("SELECT count(*) n FROM messages WHERE wa_message_id='qa-lid'").get().n,1);
  db.prepare("INSERT INTO operations(id,to_e164,idempotency_key,request_hash,wa_message_id,status,created_at,updated_at) VALUES('op','+12025550123','key','hash','qa-lid','sent','x','x')").run();
  assert.doesNotThrow(()=>ev.emit('messages.update',[{key:{id:'qa-lid',fromMe:true},update:{status:3}}]));
  assert.equal(db.prepare("SELECT status FROM operations WHERE id='op'").get().status,'delivered');
  ev.emit('messages.update',[{key:{id:'qa-lid',fromMe:true},update:{status:4}}]);
  assert.equal(db.prepare("SELECT status FROM operations WHERE id='op'").get().status,'read');
 }finally{await worker.stop();db.close();}
});
test('QA: wrong complete identity disconnects and clears QR',async()=>{
 const db=database(),ev=new EventEmitter(),dir=mkdtempSync(resolve(tmpdir(),'wis-qa-'));let ended=0;
 db.prepare("UPDATE connections SET expected_phone_e164='+5491111115679'").run();
 const fake={default:()=>({ev,user:{id:'5492222225679:1@s.whatsapp.net'},end(){ended++;}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 try{ev.emit('connection.update',{qr:'synthetic-fixture'});ev.emit('connection.update',{connection:'open'});const c=db.prepare('SELECT * FROM connections').get();assert.equal(c.status,'disconnected');assert.equal(c.last_error,'identity_mismatch');assert.equal(c.qr_payload,null);assert.equal(ended,1);}finally{await worker.stop();db.close();}
});
test('QA: receipt before send resolves preserves read despite later lower acknowledgements',async()=>{
 const db=database(),ev=new EventEmitter(),dir=mkdtempSync(resolve(tmpdir(),'wis-qa-'));
 const previous=process.env.WIS_OUTBOUND_ENABLED;let sends=0;
 process.env.WIS_OUTBOUND_ENABLED='true';
 db.prepare("UPDATE connections SET expected_phone_e164='+5491111115679'").run();
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){},async sendMessage(){sends++;ev.emit('messages.update',[{key:{id:'early',fromMe:true},update:{status:4}},{key:{id:'early',fromMe:true},update:{status:3}}]);return {key:{id:'early'},message:{conversation:'fixture'}};}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 let worker;
 try{
  worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
  ev.emit('connection.update',{connection:'open'});
  db.prepare("INSERT INTO contacts(id,phone_e164,consent_at,consent_source,consent_scope,created_at) VALUES('c','+12025550123','2026-01-01','fixture','fixture','2026-01-01')").run();
  db.prepare("INSERT INTO messages(id,direction,type,body,created_at) VALUES('m','out','text','fixture','2026-01-01')").run();
  db.prepare("INSERT INTO operations(id,to_e164,body,message_id,idempotency_key,request_hash,created_at,updated_at) VALUES('early-op','+12025550123','fixture','m','early-key','fixture','2026-01-01','2026-01-01')").run();
  const until=Date.now()+5000;
  while(!sends&&Date.now()<until)await new Promise(r=>setTimeout(r,40));
  await new Promise(r=>setTimeout(r,10));
  assert.equal(sends,1);
  assert.equal(db.prepare("SELECT status FROM operations WHERE id='early-op'").get().status,'read');
  assert.equal(db.prepare("SELECT delivery_status FROM messages WHERE id='m'").get().delivery_status,'read');
  ev.emit('messages.update',[{key:{id:'early',fromMe:true},update:{status:2}}]);
  assert.equal(db.prepare("SELECT status FROM operations WHERE id='early-op'").get().status,'read');
 }finally{if(worker)await worker.stop();if(previous===undefined)delete process.env.WIS_OUTBOUND_ENABLED;else process.env.WIS_OUTBOUND_ENABLED=previous;db.close();}
});
