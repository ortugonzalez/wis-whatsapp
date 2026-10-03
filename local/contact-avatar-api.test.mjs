import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync,randomUUID} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('./db.mjs');
const {makeServer}=await import('./server.mjs');

test('avatar aggregate authenticates, checks real cache metadata and never queues reads',async()=>{
 const db=openDatabase(':memory:'),dir=await mkdtemp(join(tmpdir(),'wis-avatar-summary-'));
 const password=randomUUID(),salt='fixture';
 db.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(salt+':'+scryptSync(password,salt,64).toString('hex'));
 await mkdir(join(dir,'avatars'));
 const good=randomUUID()+'.jpg',missing=randomUUID()+'.jpg',empty=randomUUID()+'.jpg',corrupt=randomUUID()+'.jpg';
 await writeFile(join(dir,'avatars',good),Buffer.from([255,216,255,0]));
 await writeFile(join(dir,'avatars',empty),Buffer.alloc(0));
 await writeFile(join(dir,'avatars',corrupt),'not a jpeg');
 const put=(n,payload)=>{const target=n+'@lid';db.prepare('INSERT INTO contacts(id,wa_jid,created_at) VALUES(?,?,?)').run(String(n),target,new Date().toISOString());if(payload)db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('avatar',target,JSON.stringify(payload),new Date().toISOString());};
 const metadata={filename:good,mime:'image/jpeg',available:true,stale:false};
 put(1,metadata);put(2,{...metadata,filename:missing});put(3,{...metadata,filename:empty});put(4,{...metadata,stale:true});put(5,{...metadata,mime:'image/png'});put(6);put(7,{...metadata,filename:'../escape.jpg'});put(8,{...metadata,filename:corrupt});
 const server=makeServer(db,{stateDir:dir,adminUsername:'fixture'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const call=(path,options={})=>fetch(base+path,options);
 try{
  const path='/api/v1/contact-avatar-coverage';assert.equal((await call(path)).status,401);
  const login=await call('/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'fixture',password})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const makeToken=async scopes=>{const r=await call('/api/v1/tokens',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'fixture',scopes})});assert.equal(r.status,201);return(await r.json()).data.token;};
  const reader=await makeToken(['read']),sender=await makeToken(['send']);
  assert.equal((await call(path,{headers:{Authorization:'Bearer '+sender}})).status,403);
  const response=await call(path,{headers:{Authorization:'Bearer '+reader}});assert.equal(response.status,200);const data=(await response.json()).data;
  assert.equal(data.inspected_targets,8);assert.equal(data.cached_current,2);assert.equal(data.cached_stale,1);assert.equal(data.no_cached_file,4);assert.equal(data.not_collected,1);
  assert.equal(data.content_signature_verified,false);assert.equal(data.freshness_confirmed,false);assert.equal(data.cache_ttl_seconds,30);assert.ok(Number.isFinite(Date.parse(data.checked_at)));
  assert.doesNotMatch(JSON.stringify(data),/@lid|escape|filename|not a jpeg/);
  // File metadata may pass while content-signature validation still rejects bytes.
  assert.equal((await call('/api/v1/avatars?target=8%40lid&content=1',{headers:{Cookie:cookie}})).status,415);
  await rm(join(dir,'avatars',good));
  const cached=(await(await call(path,{headers:{Authorization:'Bearer '+reader}})).json()).data;
  assert.deepEqual(cached,data); // checked_at makes the 30-second cache explicit.
  assert.equal(db.prepare('SELECT count(*) AS n FROM read_commands').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
