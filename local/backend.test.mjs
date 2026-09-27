import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync,randomBytes} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('./db.mjs');
const {makeServer}=await import('./server.mjs');
test('local HTTP authorization, consent, queue transaction, replay and private QR',async()=>{
 const database=openDatabase(':memory:');const salt='test-salt',password=randomBytes(20).toString('hex');database.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(salt+':'+scryptSync(password,salt,64).toString('hex'));
 const server=makeServer(database);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const call=async(path,method='GET',body,token,headers={})=>{const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,json:await response.json(),headers:response.headers};};
 const original=process.env.WIS_OUTBOUND_ENABLED;
 try{
  assert.equal((await call('/api/v1/contacts')).status,401);
  assert.equal((await call('/api/login','POST',{password},null,{Origin:'https://other.example'})).status,403);
  const login=await call('/api/login','POST',{password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  database.prepare("UPDATE connections SET qr_payload='private-qr',qr_expires_at=?").run(new Date(Date.now()+30000).toISOString());const connection=await call('/api/whatsapp/connection');assert.equal(connection.json.data.qr_payload,undefined);
  const created=await call('/api/v1/tokens','POST',{name:'send only',scopes:['send']});assert.equal(created.status,201);const token=created.json.data.token;
  assert.equal((await call('/api/v1/contacts','GET',null,token)).status,403);
  const contact=(await call('/api/v1/contacts','POST',{phone_e164:'+12025555679',display_name:'Local test',consent_at:new Date().toISOString(),consent_source:'test',consent_scope:'test'})).json.data;
  const payload={to:contact.phone_e164,type:'text',body:'local simulation'};process.env.WIS_OUTBOUND_ENABLED='false';assert.equal((await call('/api/v1/messages','POST',payload,token,{'Idempotency-Key':'one'})).json.error,'outbound_disabled');assert.equal(database.prepare('SELECT count(*) AS n FROM operations').get().n,0);
  process.env.WIS_OUTBOUND_ENABLED='true';const first=await call('/api/v1/messages','POST',payload,token,{'Idempotency-Key':'one'});assert.equal(first.status,202);assert.ok(first.json.data.message_id);
  assert.equal((await call('/api/v1/messages','POST',payload,token,{'Idempotency-Key':'one'})).json.data.id,first.json.data.id);assert.equal(database.prepare('SELECT count(*) AS n FROM messages').get().n,1);
  assert.equal((await call('/api/v1/messages','POST',{...payload,body:'changed'},token,{'Idempotency-Key':'one'})).status,409);
  await call('/api/v1/contacts','PATCH',{id:contact.id,opted_out_at:new Date().toISOString()});assert.equal((await call('/api/v1/messages','POST',payload,token,{'Idempotency-Key':'two'})).status,403);
  assert.equal((await call('/api/v1/contacts','PATCH',{id:contact.id,opted_out_at:null})).status,409);
  await call('/api/v1/tokens?id='+created.json.data.id,'DELETE');assert.equal((await call('/api/v1/messages','POST',payload,token,{'Idempotency-Key':'three'})).status,401);
  database.prepare("INSERT INTO contacts(id,wa_jid,created_at) VALUES('lid','123@lid',?)").run(new Date().toISOString());
  database.prepare("UPDATE operations SET status='delivered' WHERE id=?").run(first.json.data.id);database.prepare("UPDATE operations SET status='read' WHERE id=?").run(first.json.data.id);
  database.prepare("INSERT INTO webhooks(id,url,secret,enabled,created_at) VALUES('test','https://example.com','test',1,?)").run(new Date().toISOString());database.prepare("UPDATE messages SET delivery_status='read' WHERE id=?").run(first.json.data.message_id);assert.equal(database.prepare('SELECT count(*) AS n FROM webhook_deliveries').get().n,1);
 }finally{if(original===undefined)delete process.env.WIS_OUTBOUND_ENABLED;else process.env.WIS_OUTBOUND_ENABLED=original;await new Promise(r=>server.close(r));database.close();}
});
