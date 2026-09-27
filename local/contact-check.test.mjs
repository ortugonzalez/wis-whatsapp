import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {runWorker} from './worker.mjs';

test('manual contact check confirms only exact positive matches and leaves omissions unknown',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));const now=new Date().toISOString();
 db.prepare('INSERT INTO connections(id,command,updated_at) VALUES(?,?,?)').run('wis-5679','connect',now);
 const phone='+15555550101',unknown='+15555550102';for(const [id,p] of [['contact-a',phone],['contact-b',unknown]])db.prepare('INSERT INTO contacts(id,phone_e164,display_name,created_at) VALUES(?,?,?,?)').run(id,p,'Known',now);
 const ev=new EventEmitter(),calls=[],socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},onWhatsApp:async p=>{calls.push(p);return p===phone?[{jid:'15555550101@s.whatsapp.net',exists:true}]:[];}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),downloadMediaMessage:async()=>{throw Error('unexpected_download');},DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},readIntervalMs:0,authDir:resolve(mkdtempSync(resolve(tmpdir(),'wis-contact-check-')),'auth')});
 try{ev.emit('connection.update',{connection:'open'});await new Promise(resolve=>setTimeout(resolve,20));for(const [command,target] of [['check-a','contact-a'],['check-b','contact-b']]){db.prepare('INSERT INTO read_commands(id,kind,target,created_at,updated_at) VALUES(?,?,?,?,?)').run(command,'contact_check',target,now,now);await worker.drainReads();}
  assert.deepEqual(calls,[phone,unknown]);const positive=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact_check' AND resource_id='contact-a'").get().payload);assert.equal(positive.status,'registered');assert.equal(positive.exists,true);assert.equal(positive.provider_jid,'15555550101@s.whatsapp.net');const absent=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact_check' AND resource_id='contact-b'").get().payload);assert.equal(absent.status,'unknown');assert.equal(absent.exists,null);
  assert.equal(db.prepare("SELECT type FROM messages WHERE id='contact-a'").get(),undefined);
 }finally{await worker.stop();db.close();}
});
