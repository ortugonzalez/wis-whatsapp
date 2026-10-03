import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';
process.env.WIS_WORKER_DISABLED='true';
process.env.WIS_OUTBOUND_ENABLED='false';
process.env.WIS_WEBHOOKS_ENABLED='false';
const {openDatabase}=await import('./db.mjs');
const {makeServer}=await import('./server.mjs');
const {verifyBackup}=await import('./backup-check.mjs');

test('isolated API opens a verified SQLite copy and exposes existing queue without processing it',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'wis-restore-api-')),source=resolve(dir,'source.sqlite'),restored=resolve(dir,'restored.sqlite');
 let fixture,sourceDb,copyDb,server;
 try{
  fixture=openDatabase(source);
  const token='wis_'+randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),at=new Date().toISOString();
  fixture.prepare('INSERT INTO tokens VALUES(?,?,?,?,?,NULL)').run('reader','fixture reader',hash,'["read"]',at);
  const avatarFile='11111111-1111-1111-1111-111111111111.jpg';
  const originalAvatar=resolve(dir,'source-state','avatars',avatarFile);
  mkdirSync(resolve(dir,'source-state','avatars'),{recursive:true});
  writeFileSync(originalAvatar,Buffer.from([255,216,255,0]));
  fixture.prepare('INSERT INTO contacts(id,wa_jid,created_at) VALUES(?,?,?)').run('avatar-fixture','123@lid',at);
  fixture.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('avatar','123@lid',JSON.stringify({filename:avatarFile,mime:'image/jpeg',size:4,available:true,stale:false}),at);
  for(const status of ['pending','sending','outcome_unknown'])fixture.prepare('INSERT INTO operations(id,to_e164,status,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(status,'+5491100000000',status,status,'fixture',at,at);
  fixture.close();fixture=null;const sourceBytes=readFileSync(source);
  const verification=await verifyBackup(source,{tempRoot:resolve(dir,'verify')});
  assert.equal(verification.recovery.ready_to_activate,false);
  assert.equal(verification.avatars_included,false);
  sourceDb=new DatabaseSync(source,{readOnly:true});await backup(sourceDb,restored);sourceDb.close();sourceDb=null;
  copyDb=openDatabase(restored);const before=copyDb.prepare('SELECT id,status,idempotency_key FROM operations ORDER BY id').all();
  server=makeServer(copyDb,{stateDir:resolve(dir,'isolated-state'),sendRecoveryEmail:null,adminRecoveryEmail:'',allowedHosts:'',trustProxy:false});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/api/v1/operations')).status,401);
  const headers={Authorization:'Bearer '+token};
  for(const status of ['pending','sending','outcome_unknown']){
   const response=await fetch(base+'/api/v1/operations?status='+status,{headers});assert.equal(response.status,200);
   const body=await response.json();assert.equal(body.data.length,1);assert.equal(body.data[0].status,status);
  }
  const overview=await (await fetch(base+'/api/v1/overview',{headers})).json();
  assert.equal(overview.data.connection.outbound_enabled,false);
  // SQLite preserves the snapshot, but does not copy the separate avatar file.
  const photos=await (await fetch(base+'/api/v1/contact-avatar-coverage',{headers})).json();
  assert.equal(photos.data.total_targets,1);assert.equal(photos.data.no_cached_file,1);
  assert.equal(photos.data.cached_current,0);assert.equal(photos.data.not_collected,0);
  const photo=await (await fetch(base+'/api/v1/avatars?target=123%40lid',{headers})).json();
  assert.equal(photo.data.observed,true);assert.equal(photo.data.cached,false);
  assert.equal(photo.data.available,false);assert.equal(photo.data.content_url,null);
  assert.deepEqual(readFileSync(originalAvatar),Buffer.from([255,216,255,0]));
  assert.deepEqual(copyDb.prepare('SELECT id,status,idempotency_key FROM operations ORDER BY id').all(),before);
  assert.equal(copyDb.prepare('SELECT lease_owner FROM connections').get().lease_owner,null);
  assert.equal(copyDb.prepare('SELECT count(*) n FROM read_commands').get().n,0);
  assert.deepEqual(readFileSync(source),sourceBytes);
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  fixture?.close();sourceDb?.close();copyDb?.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
