import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import{mkdtempSync,rmSync,readdirSync}from'node:fs';import{tmpdir}from'node:os';import{resolve}from'node:path';
process.env.WIS_DB_PATH=':memory:';const{openDatabase}=await import('./db.mjs');const{runWorker}=await import('./worker.mjs');
test('stalled media cannot block later text ingestion or start parallel unresolved downloads',async()=>{
 const db=openDatabase(':memory:'),dir=mkdtempSync(resolve(tmpdir(),'wis-media-bound-')),ev=new EventEmitter();let worker,complete,downloads=0;
 const fake={default:()=>({ev,user:{id:'5491111115679@s.whatsapp.net'},end(){}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401},downloadMediaMessage:async()=>{downloads++;return new Promise(r=>complete=r);}};
 try{db.prepare("UPDATE connections SET command='connect'").run();worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir:resolve(dir,'media'),mediaDownloadTimeoutMs:10});
 const msg=(id,message)=>({key:{id,remoteJid:'5491100000000@s.whatsapp.net',fromMe:false},messageTimestamp:1700000000,message});
 ev.emit('messages.upsert',{type:'notify',messages:[msg('image-a',{imageMessage:{caption:'fixture'}}),msg('image-b',{imageMessage:{caption:'fixture'}}),msg('text',{conversation:'after-media'})]});
 const until=Date.now()+1500;while(db.prepare('SELECT count(*) n FROM messages').get().n<3&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
 assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,3);assert.equal(db.prepare("SELECT body FROM messages WHERE wa_message_id='text'").get().body,'after-media');assert.equal(downloads,1);assert.equal(db.prepare('SELECT count(*) n FROM messages WHERE media_path IS NOT NULL').get().n,0);
 complete(Buffer.from('late-fixture'));await new Promise(r=>setImmediate(r));assert.equal(readdirSync(resolve(dir,'media')).length,0);
 }finally{complete?.(Buffer.from('cleanup'));await worker?.stop();db.close();rmSync(dir,{recursive:true,force:true});}
});
