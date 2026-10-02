import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
process.env.WIS_DB_PATH=':memory:';const {openDatabase}=await import('./db.mjs');const {runWorker}=await import('./worker.mjs');
test('late send completion after shutdown never claims success or overwrites a reconciled operation',async()=>{
 const original=process.env.WIS_OUTBOUND_ENABLED;process.env.WIS_OUTBOUND_ENABLED='true';
 try{for(const scenario of ['late_success','reconciled','closed_db_success','closed_db_rejection']){
  const reconciled=scenario==='reconciled',closed=scenario.startsWith('closed_db');
  const db=openDatabase(':memory:'),dir=mkdtempSync(resolve(tmpdir(),'wis-send-owner-')),ev=new EventEmitter();let complete,rejectSend,startedResolve,timeout,worker,dbClosed=false;
  const started=new Promise((resolveStarted,reject)=>{startedResolve=resolveStarted;timeout=setTimeout(()=>reject(Error('fixture_send_not_started')),10000);});
  const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},sendMessage:async()=>{startedResolve();return new Promise((r,j)=>{complete=r;rejectSend=j;});}};
  const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
  db.prepare("UPDATE connections SET command='connect',expected_phone_e164='+5491111115679'").run();
  db.prepare('INSERT INTO contacts(id,phone_e164,consent_at,consent_source,consent_scope,created_at) VALUES(?,?,?,?,?,?)').run('fixture','+5491100000000','2026-01-01','fixture','transactional','2026-01-01');
  try{worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});ev.emit('connection.update',{connection:'open'});await new Promise(r=>setImmediate(r));
   db.prepare('INSERT INTO operations(id,to_e164,body,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('fixture','+5491100000000','synthetic','fixture','fixture','2026-01-01','2026-01-01');
   await started;clearTimeout(timeout);assert.equal(db.prepare('SELECT status FROM operations').get().status,'sending');await worker.stop();
   assert.equal(db.prepare('SELECT status FROM operations').get().status,'outcome_unknown');
   if(reconciled)db.prepare("UPDATE operations SET status='delivered',wa_message_id='reconciled-fixture'").run();
   if(closed){db.close();dbClosed=true;}
   if(scenario==='closed_db_rejection')rejectSend(Error('synthetic_socket_closed'));else complete({key:{id:'late-fixture'}});await new Promise(r=>setImmediate(r));
   if(!closed){const op=db.prepare('SELECT status,wa_message_id,last_error FROM operations').get();assert.equal(op.status,reconciled?'delivered':'outcome_unknown');assert.equal(op.wa_message_id,reconciled?'reconciled-fixture':null);if(!reconciled)assert.equal(op.last_error,'reconciliation_required');}
  }finally{clearTimeout(timeout);complete?.({key:{id:'cleanup-fixture'}});await new Promise(r=>setImmediate(r));await worker?.stop();if(!dbClosed)db.close();rmSync(dir,{recursive:true,force:true});}
 }}finally{if(original===undefined)delete process.env.WIS_OUTBOUND_ENABLED;else process.env.WIS_OUTBOUND_ENABLED=original;}
});

test('old socket completion after replacement cannot claim success or enqueue a duplicate',async()=>{
 const original=process.env.WIS_OUTBOUND_ENABLED;process.env.WIS_OUTBOUND_ENABLED='true';
 const db=openDatabase(':memory:'),dir=mkdtempSync(resolve(tmpdir(),'wis-send-replacement-'));let worker,complete,startedResolve,replacedResolve,timer,sends=0,created=0;
 const started=new Promise(r=>startedResolve=r),replaced=new Promise(r=>replacedResolve=r);
 const socket={ev:new EventEmitter(),user:{id:'5491111115679@s.whatsapp.net'},end(){},sendMessage:async()=>{sends++;startedResolve();return new Promise(r=>complete=r);}};
 const replacement={ev:new EventEmitter(),user:socket.user,end(){},sendMessage:async()=>{sends++;throw Error('unexpected_duplicate');}};
 const fake={default:()=>{if(created++===0)return socket;replacedResolve();return replacement;},useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('replacement_fixture_timeout')),12000);});
 try{
  db.prepare("UPDATE connections SET command='connect',expected_phone_e164='+5491111115679'").run();
  db.prepare('INSERT INTO contacts(id,phone_e164,consent_at,consent_source,consent_scope,created_at) VALUES(?,?,?,?,?,?)').run('fixture','+5491100000000','2026-01-01','fixture','transactional','2026-01-01');
  worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});socket.ev.emit('connection.update',{connection:'open'});
  db.prepare('INSERT INTO operations(id,to_e164,body,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('fixture','+5491100000000','synthetic','fixture','fixture','2026-01-01','2026-01-01');
  await Promise.race([started,deadline]);db.prepare("UPDATE connections SET command='reconnect'").run();await Promise.race([replaced,deadline]);await new Promise(r=>setImmediate(r));replacement.ev.emit('connection.update',{connection:'open'});
  complete({key:{id:'late-old-socket'}});await new Promise(r=>setImmediate(r));
  const op=db.prepare('SELECT status,wa_message_id,last_error FROM operations').get();assert.equal(op.status,'outcome_unknown');assert.equal(op.wa_message_id,null);assert.equal(op.last_error,'reconciliation_required');assert.equal(sends,1);assert.equal(created,2);assert.equal(db.prepare('SELECT status FROM connections').get().status,'connected');assert.equal(db.prepare('SELECT count(*) n FROM operations').get().n,1);
 }finally{clearTimeout(timer);complete?.({key:{id:'cleanup'}});await new Promise(r=>setImmediate(r));await worker?.stop();db.close();rmSync(dir,{recursive:true,force:true});if(original===undefined)delete process.env.WIS_OUTBOUND_ENABLED;else process.env.WIS_OUTBOUND_ENABLED=original;}
});
