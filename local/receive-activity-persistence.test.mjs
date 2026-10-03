import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {attachReceiveActivity,readUpsertActivity} from './receive-activity.mjs';

test('passive reception evidence survives SQLite reopening without inventing reception from history or echoes',()=>{
 const directory=mkdtempSync(join(tmpdir(),'wis-reception-qa-')),file=join(directory,'test.sqlite');
 let db=new DatabaseSync(file),owns=true;
 try{
  db.exec('CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT,PRIMARY KEY(kind,resource_id))');
  const ev=new EventEmitter(),at='2026-10-03T09:00:00.000Z';
  attachReceiveActivity(ev,{guarded:fn=>value=>{if(owns)fn(value);},now:()=>at,snapshot:(kind,id,data)=>db.prepare('INSERT INTO snapshots VALUES(?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(kind,id,JSON.stringify(data),at)});
  const fixture={key:{fromMe:false,remoteJid:'synthetic@example.test',id:'secret-test-id'},message:{conversation:'secret-test-body'},messageTimestamp:1};
  ev.emit('messaging-history.set',{messages:[fixture]});assert.equal(readUpsertActivity(db),null);
  ev.emit('messages.upsert',{type:'notify',messages:[fixture,fixture]});
  const notifyBefore=db.prepare("SELECT payload FROM snapshots WHERE kind='receive_activity' AND resource_id='inbound_notify'").get().payload;
  assert.equal(JSON.parse(notifyBefore).inbound_envelopes,2);assert.equal(JSON.parse(notifyBefore).observed_at,at);
  ev.emit('messages.upsert',{type:'append',messages:[{...fixture,key:{...fixture.key,fromMe:true}}]});
  assert.equal(db.prepare("SELECT count(*) AS n FROM snapshots WHERE resource_id='inbound_append'").get().n,0);
  const before=readUpsertActivity(db);assert.equal(before.outbound,1);assert.equal(before.inbound,0);
  owns=false;ev.emit('messages.upsert',{type:'notify',messages:[fixture]});assert.deepEqual(readUpsertActivity(db),before);
  db.close();db=new DatabaseSync(file);
  assert.deepEqual(readUpsertActivity(db),before);
  assert.equal(db.prepare("SELECT payload FROM snapshots WHERE kind='receive_activity' AND resource_id='inbound_notify'").get().payload,notifyBefore);
  const persisted=JSON.stringify(db.prepare('SELECT payload FROM snapshots').all());assert.doesNotMatch(persisted,/secret-test|synthetic@example/);
  assert.equal(readUpsertActivity(db).unique_messages,false);assert.equal(readUpsertActivity(db).persistence_confirmed,false);
 }finally{db.close();const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('wis-reception-qa-'));rmSync(target,{recursive:true,force:true});}
});
