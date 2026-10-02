import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomBytes} from 'node:crypto';
process.env.WIS_DB_PATH=':memory:';const {openDatabase}=await import('./db.mjs');const {makeServer}=await import('./server.mjs');
test('overview profile date excludes newer history and account observations',async()=>{
 const db=openDatabase(':memory:'),token='wis_'+randomBytes(32).toString('hex');db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?,NULL)').run('reader','reader',createHash('sha256').update(token).digest('hex'),'["read"]',new Date().toISOString());
 const server=makeServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/v1/overview';const get=async()=>(await (await fetch(url,{headers:{Authorization:'Bearer '+token}})).json()).data;
 const add=(kind,id,date)=>db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run(kind,id,'{}',date);
 try{assert.equal((await get()).account_updated_at,null);add('history','wis-5679','2026-10-02T20:00:00Z');add('profile','other-fixture','2026-10-02T21:00:00Z');assert.equal((await get()).account_updated_at,null);add('profile','wis-5679','2026-10-01T12:00:00Z');add('account_settings','wis-5679','2026-10-02T22:00:00Z');assert.equal((await get()).account_updated_at,'2026-10-01T12:00:00Z');}finally{await new Promise(r=>server.close(r));db.close();}
});
