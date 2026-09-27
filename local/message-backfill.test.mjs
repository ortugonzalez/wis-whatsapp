import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {runWorker} from './worker.mjs';
test('passive duplicate enriches missing metadata once without row changes, media downloads or tombstone resurrection',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));const now='2026-01-01T00:00:00.000Z',jid='12025550111@s.whatsapp.net';
 db.prepare('INSERT INTO connections(id,command,updated_at) VALUES(?,?,?)').run('wis-5679','connect',now);
 db.prepare('INSERT INTO conversations(id,wa_chat_id,last_message_preview,last_message_at) VALUES(?,?,?,?)').run('chat',jid,'unchanged',now);
 const insert=(id,type='location',body='Place',direction='in')=>db.prepare('INSERT INTO messages(id,conversation_id,wa_message_id,direction,type,body,delivery_status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'chat',id,direction,type,body,'delivered','import',now);
 for(const id of ['ok','wrong_jid','wrong_direction','wrong_type','old_edit','revoked','snapshot','different_body'])insert(id);
 insert('media','image','photo');insert('nullbody','location',null);insert('out','location','Place','out');
 db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('message','snapshot',JSON.stringify({edited:true,details:{preserve:true}}),now);
 for(const [id,kind] of [['old_edit','message.edited'],['revoked','message.revoked']])db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(id,kind,id,'{}',now);
 const before=db.prepare('SELECT * FROM messages ORDER BY id').all(),chatBefore=db.prepare('SELECT * FROM conversations').all();
 const ev=new EventEmitter();let downloads=0;
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),downloadMediaMessage:async()=>{downloads++;throw Error('unexpected');},DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(mkdtempSync(resolve(tmpdir(),'wis-backfill-')),'auth')});
 const message=(id,overrides={})=>({key:{id,remoteJid:jid,fromMe:false},messageTimestamp:1900000000,message:{locationMessage:{name:'Place',degreesLatitude:0,url:'SECRET',contextInfo:{stanzaId:'quoted',quotedMessage:{conversation:'quote'},messageSecret:Buffer.from('SECRET')}}},...overrides});
 try{ev.emit('connection.update',{connection:'open'});ev.emit('messages.upsert',{type:'notify',messages:[message('ok'),message('ok'),message('wrong_jid',{key:{id:'wrong_jid',remoteJid:'999@s.whatsapp.net',fromMe:false}}),message('wrong_direction',{key:{id:'wrong_direction',remoteJid:jid,fromMe:true}}),message('wrong_type',{message:{conversation:'Place'}}),message('old_edit'),message('revoked'),message('snapshot'),message('nullbody'),message('different_body',{message:{locationMessage:{name:'Changed'}}}),message('media',{message:{imageMessage:{caption:'photo',mediaKey:Buffer.from('SECRET'),url:'SECRET'}}}),message('out',{key:{id:'out',remoteJid:jid,fromMe:true}})]});await new Promise(r=>setTimeout(r,25));
 const rows=db.prepare("SELECT * FROM snapshots WHERE kind='message' ORDER BY resource_id").all();assert.deepEqual(rows.map(r=>r.resource_id),['media','ok','out','snapshot']);const data=JSON.parse(rows.find(r=>r.resource_id==='ok').payload);assert.equal(data.metadata_backfilled,true);assert.equal(data.timestamp,now);assert.equal(data.source,'import');assert.equal(data.details.degreesLatitude,0);assert.ok(Number.isFinite(Date.parse(data.metadata_observed_at)));assert.equal(JSON.stringify(rows).includes('SECRET'),false);assert.deepEqual(db.prepare('SELECT * FROM messages ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM conversations').all(),chatBefore);assert.equal(downloads,0);
 ev.emit('messages.upsert',{type:'notify',messages:[message('ok',{message:{locationMessage:{name:'Place',degreesLatitude:8}}})]});await new Promise(r=>setTimeout(r,25));assert.equal(db.prepare("SELECT payload FROM snapshots WHERE kind='message' AND resource_id='ok'").get().payload,rows.find(r=>r.resource_id==='ok').payload);
 }finally{await worker.stop();db.close();}
});
