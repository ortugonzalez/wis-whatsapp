import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {checkedGroupInvite,expireGroupInvites,runWorker} from './worker.mjs';
test('invite IQ is GET only and rejects missing or conflicting provider evidence',async()=>{
 const target='12345@g.us',code='Abc123TestInvite',reply={tag:'iq',attrs:{type:'result'},content:[{tag:'invite',attrs:{code}}]};
 assert.equal(await checkedGroupInvite({query:async(node,timeout)=>{assert.deepEqual(node,{tag:'iq',attrs:{to:target,type:'get',xmlns:'w:g2'},content:[{tag:'invite',attrs:{}}]});assert.equal(timeout,10000);return reply;}},target),code);
 for(const value of [undefined,{...reply,content:[]},{...reply,content:[...reply.content,{tag:'error',attrs:{code:'403'}}]},{...reply,content:[{tag:'invite',attrs:{code:'https://secret'}}]}])await assert.rejects(checkedGroupInvite({query:async()=>value},target));
});
test('known group manual invite expires and failure clears credential without event disclosure',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));const now=new Date().toISOString(),target='12345@g.us',code='Abc123TestInvite';
 db.prepare('INSERT INTO connections(id,command,updated_at) VALUES(?,?,?)').run('wis-5679','connect',now);
 db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('group',target,'{}',now);
 const ev=new EventEmitter();let queries=0,fail=false;
 const socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},query:async node=>{queries++;assert.equal(node.attrs.type,'get');return fail?undefined:{tag:'iq',attrs:{type:'result'},content:[{tag:'invite',attrs:{code}}]};}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},authDir:resolve(mkdtempSync(resolve(tmpdir(),'wis-invite-')),'auth'),readIntervalMs:0});
 try{ev.emit('connection.update',{connection:'open'});db.prepare('DELETE FROM read_commands').run();
 const command=async(id,jid)=>{db.prepare('INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'group_invite',jid,'pending',now,now);await worker.drainReads();};
 const get=()=>JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='group_invite' AND resource_id=?").get(target).payload);
 await command('unknown','99999@g.us');assert.equal(queries,0);
 await command('success',target);assert.equal(get().code,code);assert.equal(get().available,true);
 expireGroupInvites(db,new Date(Date.now()+301000).toISOString());assert.equal(get().code,null);assert.equal(get().available,false);
 await command('again',target);fail=true;await command('failure',target);assert.equal(get().code,null);assert.equal(get().expires_at,null);assert.equal(get().available,false);
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM events').all()).includes(code),false);
 }finally{await worker.stop();db.close();}
});
