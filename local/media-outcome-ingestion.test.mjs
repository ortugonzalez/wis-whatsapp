import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {Readable} from 'node:stream';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('./db.mjs');
const {runWorker}=await import('./worker.mjs');

test('oversize, provider failure, disk failure and history preserve readable messages without exposing errors',async()=>{
 const db=openDatabase(':memory:'),dir=mkdtempSync(resolve(tmpdir(),'wis-media-outcomes-')),mediaDir=resolve(dir,'media'),ev=new EventEmitter();
 let worker,downloads=0;
 const fake={default:()=>({ev,user:{id:'5491111115679@s.whatsapp.net'},end(){}}),useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401},downloadMediaMessage:async msg=>{
  downloads++;
  if(msg.key.id==='oversize')return Readable.from([Buffer.alloc(25*1024*1024),Buffer.from('x')]);
  if(msg.key.id==='provider')throw new Error('PRIVATE_PROVIDER_URL_AND_TOKEN');
  return Readable.from([Buffer.from('fixture')]);
 }};
 const msg=id=>({key:{id,remoteJid:'5491100000000@s.whatsapp.net',fromMe:false},messageTimestamp:1700000000,message:{imageMessage:{caption:'fixture'}}});
 const waitFor=async id=>{const deadline=Date.now()+2000;while(Date.now()<deadline){const row=db.prepare('SELECT * FROM messages WHERE wa_message_id=?').get(id);if(row)return row;await new Promise(r=>setTimeout(r,10));}assert.fail('message did not persist');};
 const snapshot=id=>JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id=?").get(id).payload);
 try{
  db.prepare("UPDATE connections SET command='connect'").run();
  worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(dir,'auth'),mediaDir});
  for(const id of ['oversize','provider']){
   ev.emit('messages.upsert',{type:'notify',messages:[msg(id)]});
   const row=await waitFor(id);assert.equal(row.body,'fixture');assert.equal(row.media_path,null);
   assert.equal(snapshot(id).media_download.status,id==='oversize'?'too_large':'failed');
  }
  assert.equal(readdirSync(mediaDir).length,0);
  // Replace only this test's empty temporary media directory with a file.
  rmSync(mediaDir,{recursive:true});writeFileSync(mediaDir,'fixture obstruction');
  ev.emit('messages.upsert',{type:'notify',messages:[msg('disk')]});
  assert.equal((await waitFor('disk')).media_path,null);assert.equal(snapshot('disk').media_download.status,'failed');
  unlinkSync(mediaDir);
  const previous=downloads;
  ev.emit('messaging-history.set',{messages:[msg('history')],contacts:[],chats:[],isLatest:true});
  assert.equal((await waitFor('history')).media_path,null);assert.equal(downloads,previous);
  assert.equal(snapshot('history').media_download.status,'history_not_requested');
  for(const id of ['oversize','provider','disk','history']){
   const outcome=snapshot(id).media_download;
   assert.deepEqual(Object.keys(outcome).sort(),['observed_at','status']);
   assert.ok(Number.isFinite(Date.parse(outcome.observed_at)));
   assert.doesNotMatch(JSON.stringify(snapshot(id)),/PRIVATE_PROVIDER|obstruction/);
  }
 }finally{await worker?.stop();db.close();rmSync(dir,{recursive:true,force:true});}
});
