import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from './db.mjs';
import {createBlocklistInvalidation} from './blocklist-invalidation.mjs';
test('blocklist delta invalidates without constructing or mutating the last verified list',()=>{
 const db=openDatabase(':memory:');try{
 const observer=createBlocklistInvalidation(db);
 assert.equal(observer.observe({type:'add',blocklist:['123@s.whatsapp.net']}),true);
 assert.equal(db.prepare("SELECT count(*) n FROM snapshots WHERE kind='blocklist'").get().n,0);
 db.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('blocklist','wis-5679',?,'old')").run(JSON.stringify({ids:['456@lid'],available:true,response_verified:true,last_success_at:'2026-01-01T00:00:00Z'}));
 observer.observe({type:'remove',blocklist:['456@lid'],secret:'SECRET'});
 const row=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='blocklist'").get().payload);
 assert.deepEqual(row.ids,['456@lid']);assert.equal(row.stale,true);assert.equal(row.response_verified,false);assert.equal(row.last_success_at,'2026-01-01T00:00:00Z');assert.equal(row.secret,undefined);assert.equal(observer.revision,2);
 for(const payload of [{type:'add',blocklist:[]},{type:'other',blocklist:['123@lid']},{type:'add',blocklist:['123@lid\n']},{type:'remove',blocklist:['123@g.us']}])assert.equal(observer.observe(payload),false);
 assert.equal(observer.revision,2);
 }finally{db.close();}
});
