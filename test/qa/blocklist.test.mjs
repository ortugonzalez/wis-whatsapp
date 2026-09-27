import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync,randomBytes} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('../../local/db.mjs');
const {makeServer}=await import('../../local/server.mjs');
test('blocklist retains successful IDs with sanitized failure metadata and administrator authorization',async()=>{
 const db=openDatabase(':memory:'),password=randomBytes(20).toString('hex'),salt='blocklist-test';
 db.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(salt+':'+scryptSync(password,salt,64).toString('hex'));
 const server=makeServer(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const request=async(path,method='GET',body,token)=>{const res=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json(),headers:res.headers};};
 try{
  assert.equal((await request('/api/v1/blocklist')).status,401);
  const login=await request('/api/login','POST',{password});cookie=login.headers.get('set-cookie').split(';')[0];
  const reader=(await request('/api/v1/tokens','POST',{name:'reader',scopes:['read']})).body.data.token;
  assert.equal((await request('/api/v1/blocklist','GET',null,reader)).status,403);
  assert.equal((await request('/api/v1/snapshots?kind=blocklist','GET',null,reader)).status,400);
  const absent=(await request('/api/v1/blocklist')).body.meta;assert.equal(absent.last_success_at,null);assert.equal(absent.stale,false);
  const success='2026-01-01T10:00:00.000Z',attempt='2026-01-02T10:00:00.000Z';
  const payload={ids:['123@s.whatsapp.net'],available:true,response_verified:true,stale:false,last_attempt_at:success,last_success_at:success,error:null};
  db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('blocklist','wis-5679',?,?)").run(JSON.stringify(payload),success);
  const initial=(await request('/api/v1/blocklist')).body;assert.equal(initial.meta.collection_status,'complete');assert.equal(initial.meta.last_success_at,success);
  db.prepare("UPDATE snapshots SET payload=?,updated_at=? WHERE kind='blocklist'").run(JSON.stringify({...payload,available:false,stale:true,last_attempt_at:attempt,error:'provider_error'}),attempt);
  const failed=(await request('/api/v1/blocklist')).body;assert.deepEqual(failed.data,initial.data);assert.equal(failed.meta.stale,true);assert.equal(failed.meta.available,false);assert.equal(failed.meta.error,'provider_error');assert.equal(failed.meta.last_success_at,success);assert.equal(failed.meta.last_attempt_at,attempt);assert.equal(failed.meta.collection_status,'unavailable');
  db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.error','abcdef123secret','$.last_attempt_at','private-value') WHERE kind='blocklist'").run();
  const sanitized=(await request('/api/v1/blocklist')).body;assert.equal(sanitized.meta.error,'read_failed');assert.equal(sanitized.meta.last_attempt_at,null);assert.equal(JSON.stringify(sanitized).includes('secret'),false);
  assert.equal((await request('/api/v1/blocklist','POST',{})).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
