import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('../../local/db.mjs');
const {makeServer}=await import('../../local/server.mjs');

test('QA: old operation ID remains queryable beyond first 100, read tokens cannot issue sync or access account',async()=>{
 const db=openDatabase(':memory:'),token='wis_'+('A'.repeat(43));
 db.prepare("INSERT INTO tokens(id,name,token_hash,scopes,created_at) VALUES('reader','fixture',?,'[\"read\"]','2026-01-01')").run(createHash('sha256').update(token).digest('hex'));
 for(let i=0;i<130;i++)db.prepare('INSERT INTO operations(id,to_e164,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('op-'+i,'+12025550123','k-'+i,'h','2026-01-01T00:'+String(Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0')+'Z','2026-01-01');
 const server=makeServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,options={})=>fetch(base+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});
 try{
  const old=await request('/api/v1/operations?id=op-0');assert.equal(old.status,200);const data=await old.json();assert.equal(data.data.length,1);assert.equal(data.data[0].id,'op-0');
  const page=await (await request('/api/v1/operations?offset=110&limit=10')).json();assert.equal(page.meta.total,130);assert.equal(page.data.length,10);assert.equal(page.meta.has_more,true);
  assert.equal((await request('/api/v1/account')).status,403);
  assert.equal((await request('/api/v1/sync',{method:'POST',body:JSON.stringify({kind:'all'})})).status,403);
  assert.equal((await request('/api/v1/snapshots?kind=profile')).status,400);
  assert.equal((await request('/api/v1/media?path=..%2Fadmin-access.txt')).status,400);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
