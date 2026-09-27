import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {timestamp,identityMatches,acquireLease,mediaFile,runWorker} from './worker.mjs';
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.prepare("INSERT INTO connections(id,status,updated_at) VALUES('wis-5679','disconnected',?)").run(new Date().toISOString());return db;}
test('complete identity, timestamp and media traversal guards',()=>{
 assert.equal(identityMatches('5491111115679','+5491111115679'),true);
 assert.equal(identityMatches('5491111115679','5679'),false);
 assert.equal(timestamp({toNumber:()=>1700000000}),'2023-11-14T22:13:20.000Z');
 assert.equal(timestamp(1700000000000),null);
 assert.throws(()=>mediaFile(resolve('media'),'../secret'),/invalid_media_path/);
});
test('SQLite lease rejects concurrent ownership and permits expired takeover',()=>{
 const db=database();const now=Date.now();
 assert.equal(acquireLease(db,'one',now),true);
 assert.equal(acquireLease(db,'two',now),false);
 assert.equal(acquireLease(db,'one',now+1000),true);
 assert.equal(acquireLease(db,'two',now+32000),true);db.close();
});
test('mock socket QR, persistent incoming history, no sends and graceful lease release',async()=>{
 const db=database();db.prepare("UPDATE connections SET command='connect'").run();
 const ev=new EventEmitter();let sends=0,ended=0;
 const dir=mkdtempSync(resolve(tmpdir(),'wis-worker-test-'));
 const socket={ev,user:{id:'5491111115679:1@s.whatsapp.net'},end(){ended++;},sendMessage(){sends++;throw Error('no send allowed');}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media')});
 ev.emit('connection.update',{qr:'mock-qr'});
 assert.ok(db.prepare('SELECT qr_expires_at FROM connections').get().qr_expires_at);
 ev.emit('connection.update',{connection:'open'});
 assert.equal(db.prepare('SELECT phone FROM connections').get().phone,'5491111115679');
 ev.emit('messages.upsert',{messages:[{key:{id:'live',remoteJid:'123@g.us'},messageTimestamp:1700000001,message:{conversation:'new'}}]});
 ev.emit('messaging-history.set',{messages:[{key:{id:'old',remoteJid:'123@g.us'},messageTimestamp:1700000000,message:{conversation:'old'}}]});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n,2);
 assert.equal(db.prepare("SELECT source FROM messages WHERE wa_message_id='old'").get().source,'import');
 assert.equal(db.prepare('SELECT last_message_preview FROM conversations').get().last_message_preview,'new');
 assert.equal(sends,0);await worker.stop();assert.equal(ended,1);
 assert.equal(db.prepare('SELECT lease_owner FROM connections').get().lease_owner,null);db.close();
});
