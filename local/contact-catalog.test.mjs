import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {runWorker} from './worker.mjs';
test('contact catalog uses only known PN and scopes checked replies/errors to requested owner',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));const now=new Date().toISOString();db.prepare('INSERT INTO connections(id,command,updated_at) VALUES(?,?,?)').run('wis-5679','connect',now);
 const target='1234567@s.whatsapp.net',own='5491111115679@s.whatsapp.net';db.prepare('INSERT INTO contacts(id,phone_e164,created_at) VALUES(?,?,?)').run('known','+1234567',now);
 db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('catalog',own,JSON.stringify({marker:'own'}),now);
 const ev=new EventEmitter();let queries=0,fail=false,publicReads=0;
 const socket={ev,user:{id:own},end(){},query:async node=>{queries++;assert.equal(node.attrs.type,'get');assert.equal(node.content[0].attrs.jid,target);if(fail)return undefined;return {tag:'iq',attrs:{type:'result'},content:[{tag:'product_catalog',attrs:{},content:[]}]};}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const dir=mkdtempSync(resolve(tmpdir(),'wis-contact-catalog-'));const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),readIntervalMs:0,publicCatalogReaderFactory:()=>{publicReads++;throw Error('must not use own reader');}});
 try {
  ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
  const command=async(id,jid)=>{db.prepare('INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'contact_catalog',jid,'pending',now,now);await worker.drainReads();};
  await command('unknown','5492222222222@s.whatsapp.net');await command('lid','123@lid');assert.equal(queries,0);
  await command('success',target);let data=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id=?").get(target).payload);assert.equal(data.available,true);assert.equal(data.scope,'contact_catalog');assert.equal(data.product_count,0);assert.equal(publicReads,0);
  fail=true;await command('failure',target);data=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id=?").get(target).payload);assert.equal(data.available,false);assert.equal(data.error,'read_timeout');assert.equal(JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='catalog' AND resource_id=?").get(own).payload).marker,'own');
 }finally{await worker.stop();db.close();}
});
