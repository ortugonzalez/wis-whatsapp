import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,scryptSync} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('../../local/db.mjs');
const {makeServer}=await import('../../local/server.mjs');

test('contact checks are administrator queued, restricted to known E.164 contacts, and cooldown guarded',async()=>{
 const db=openDatabase(':memory:'),password=randomBytes(20).toString('hex'),salt='contact-check';
 db.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(salt+':'+scryptSync(password,salt,64).toString('hex'));
 db.prepare('INSERT INTO contacts(id,phone_e164,display_name,created_at) VALUES(?,?,?,?)').run('contact-known','+15555550123','Known',new Date().toISOString());
 db.prepare('INSERT INTO contacts(id,phone_e164,display_name,created_at) VALUES(?,?,?,?)').run('contact-no-phone',null,'No phone',new Date().toISOString());
 const server=makeServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const req=async(path,method='GET',body,token)=>{const response=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});let json;try{json=await response.json();}catch{}return {status:response.status,json,headers:response.headers};};
 try{const login=await req('/api/login','POST',{password});cookie=login.headers.get('set-cookie').split(';')[0];const reader=(await req('/api/v1/tokens','POST',{name:'reader',scopes:['read']})).json.data.token;
  assert.equal((await req('/api/v1/sync','POST',{kind:'contact_check',target:'contact-known'},reader)).status,403);
  assert.equal((await req('/api/v1/sync','POST',{kind:'contact_check',target:'+15555550123'})).status,404);
  assert.equal((await req('/api/v1/sync','POST',{kind:'contact_check',target:'contact-missing'})).status,404);
  assert.equal((await req('/api/v1/sync','POST',{kind:'contact_check',target:'contact-no-phone'})).status,404);
  const queued=await req('/api/v1/sync','POST',{kind:'contact_check',target:'contact-known'});assert.equal(queued.status,202);assert.equal(queued.json.data.target,'contact-known');
  assert.equal((await req('/api/v1/contact-checks?id=contact-known')).json.data.command.id,queued.json.data.id);
  db.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(queued.json.data.id);db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run('contact_check','contact-known',JSON.stringify({available:true,status:'registered',exists:true,checked_at:new Date().toISOString()}),new Date().toISOString());
  assert.equal((await req('/api/v1/sync','POST',{kind:'contact_check',target:'contact-known'})).status,429);
  const cached=await req('/api/v1/contact-checks');assert.equal(cached.json.data[0].contact_id,'contact-known');assert.equal(cached.json.data[0].data.status,'registered');
 }finally{await new Promise(r=>server.close(r));db.close();}
});
