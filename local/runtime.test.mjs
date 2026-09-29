import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSupervisor} from './supervisor.mjs';
import {createGroupInviteInfoRpc} from './group-invite-info.mjs';
import {createNewsletterInviteInfoRpc} from './newsletter-invite-info.mjs';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const id='11111111-1111-4111-8111-111111111111';
function fixture(timeoutMs=1000,workerEnabled=true){const children=[],states=[],exits=[];const supervisor=createSupervisor({timeoutMs,workerEnabled,publish:s=>states.push(structuredClone(s)),exit:c=>exits.push(c),spawnChild:(kind,generation)=>{const c=new EventEmitter();Object.assign(c,{kind,generation,pid:children.length+100,exitCode:null,signalCode:null,connected:true,sent:[],send(m,cb){this.sent.push(m);cb?.();},kill(){this.signalCode='SIGTERM';this.emit('exit',null,'SIGTERM');},finish(){this.exitCode=0;this.emit('exit',0);}});children.push(c);return c;}});return {supervisor,children,states,exits};}
test('server-only deployment does not start a WhatsApp worker and reports reads unavailable',()=>{
 const f=fixture(1000,false),[server]=f.children,request='33333333-3333-4333-8333-333333333333';assert.equal(f.children.length,1);assert.equal(f.supervisor.getState().worker_pid,null);
 server.emit('message',{type:'wis.group_invite_info.request',request_id:request,invite_code:'OpaqueInviteCode'});assert.deepEqual(server.sent.at(-1),{type:'wis.group_invite_info.response',request_id:request,error:'connection_unavailable'});
 f.supervisor.stop();server.finish();assert.deepEqual(f.exits,[0]);
});
test('reload waits for old API exit and correct new ready; preserves worker and rejects concurrent reload',()=>{
 const f=fixture(),[old,worker]=f.children;assert.equal(f.supervisor.requestReload(id),true);assert.equal(f.supervisor.requestReload(id),false);assert.equal(f.children.length,2);assert.deepEqual(worker.sent,[]);old.finish();assert.equal(f.children.length,3);const api=f.children[2];api.emit('message',{type:'wis.ready',generation:'wrong'});assert.equal(f.supervisor.getState().reload.status,'starting_server');old.emit('message',{type:'wis.ready',generation:old.generation});assert.equal(f.supervisor.getState().reload.status,'starting_server');api.emit('message',{type:'wis.ready',generation:api.generation});assert.equal(f.supervisor.getState().reload.status,'ready');assert.equal(f.supervisor.getState().worker_pid,worker.pid);assert.deepEqual(worker.sent,[]);f.supervisor.stop();api.finish();worker.finish();assert.deepEqual(f.exits,[0]);
});
test('supervisor relays group invite metadata reads in memory and sanitizes unknown worker errors',()=>{
 const f=fixture(),[server,worker]=f.children,request='22222222-2222-4222-8222-222222222222';
 server.emit('message',{type:'wis.group_invite_info.request',request_id:request,invite_code:'OpaqueInviteCode'});
 assert.equal(worker.sent.at(-1).type,'wis.group_invite_info.lookup');assert.equal(worker.sent.at(-1).invite_code,'OpaqueInviteCode');assert.equal(worker.sent.at(-1).request_id,request);
 const result={data:{id:'12345@g.us'},meta:{response_verified:true}};worker.emit('message',{type:'wis.group_invite_info.result',request_id:request,result});
 assert.deepEqual(server.sent.at(-1),{type:'wis.group_invite_info.response',request_id:request,result});
 server.emit('message',{type:'wis.group_invite_info.request',request_id:request,invite_code:'second-code'});worker.emit('message',{type:'wis.group_invite_info.result',request_id:request,error:'provider replied with secret details'});
 assert.deepEqual(server.sent.at(-1),{type:'wis.group_invite_info.response',request_id:request,error:'read_failed'});
 f.supervisor.stop();server.finish();worker.finish();
});
test('group invite metadata request completes across server-supervisor-worker IPC without persistence',async()=>{
 const children=[],processes={};
 const supervisor=createSupervisor({timeoutMs:500,publish(){},exit(){},spawnChild:kind=>{
  const parent=new EventEmitter(),child=new EventEmitter();Object.assign(parent,{kind,exitCode:null,signalCode:null,connected:true,send(message,callback){setImmediate(()=>child.emit('message',message));callback?.();},finish(){this.exitCode=0;this.connected=false;this.emit('exit',0);}});Object.assign(child,{connected:true,send(message,callback){setImmediate(()=>parent.emit('message',message));callback?.();}});processes[kind]={parent,child};children.push(parent);return parent;
 }});
 processes.worker.child.on('message',message=>{if(message?.type==='wis.group_invite_info.lookup')processes.worker.child.send({type:'wis.group_invite_info.result',request_id:message.request_id,result:{data:{id:'12345@g.us'},meta:{response_verified:true}}});});
 const rpc=createGroupInviteInfoRpc({processRef:processes.server.child,timeoutMs:500});
 try{assert.deepEqual(await rpc.lookup('OpaqueInviteCode'),{data:{id:'12345@g.us'},meta:{response_verified:true}});}
 finally{rpc.close();supervisor.stop();for(const child of children)child.finish();}
});
test('newsletter invite metadata request completes across server-supervisor-worker IPC without persistence',async()=>{
 const children=[],processes={};const supervisor=createSupervisor({timeoutMs:500,publish(){},exit(){},spawnChild:kind=>{const parent=new EventEmitter(),child=new EventEmitter();Object.assign(parent,{kind,exitCode:null,signalCode:null,connected:true,send(message,callback){setImmediate(()=>child.emit('message',message));callback?.();},finish(){this.exitCode=0;this.connected=false;this.emit('exit',0);}});Object.assign(child,{connected:true,send(message,callback){setImmediate(()=>parent.emit('message',message));callback?.();}});processes[kind]={parent,child};children.push(parent);return parent;}});
 processes.worker.child.on('message',message=>{if(message?.type==='wis.newsletter_invite_info.lookup')processes.worker.child.send({type:'wis.newsletter_invite_info.result',request_id:message.request_id,result:{data:{id:'12345@newsletter',type:'newsletter'},meta:{partial:true}}});});const rpc=createNewsletterInviteInfoRpc({processRef:processes.server.child,timeoutMs:500});
 try{assert.deepEqual(await rpc.lookup('OpaqueChannelCode'),{data:{id:'12345@newsletter',type:'newsletter'},meta:{partial:true}});}
 finally{rpc.close();supervisor.stop();for(const child of children)child.finish();}
});
test('stop during API shutdown prevents replacement and ignores late ready',()=>{
 const f=fixture(),[api,worker]=f.children;f.supervisor.requestReload(id);f.supervisor.stop();api.finish();assert.equal(f.children.length,2);api.emit('message',{type:'wis.ready',generation:api.generation});worker.finish();assert.deepEqual(f.exits,[0]);assert.equal(f.supervisor.requestReload(id),false);
});
test('missing generation and repeated request IDs cannot acknowledge or trigger another reload',()=>{
 const f=fixture();f.supervisor.requestReload(id);f.children[0].finish();const api=f.children[2];api.emit('message',{type:'wis.ready'});assert.equal(f.supervisor.getState().reload.status,'starting_server');api.emit('message',{type:'wis.ready',generation:api.generation});assert.equal(f.supervisor.requestReload(id),false);assert.equal(f.children.length,3);f.supervisor.stop();api.finish();f.children[1].finish();
});
test('stop while replacement starts cannot be reversed by ready',()=>{
 const f=fixture();f.supervisor.requestReload(id);f.children[0].finish();const api=f.children[2];f.supervisor.stop();api.emit('message',{type:'wis.ready',generation:api.generation});assert.equal(f.supervisor.getState().reload.status,'starting_server');assert.deepEqual(api.sent,[{type:'wis.shutdown'}]);api.finish();f.children[1].finish();assert.deepEqual(f.exits,[0]);
});
test('ready timeout fails closed without another server or worker spawn',async()=>{
 const f=fixture(15);f.supervisor.requestReload(id);f.children[0].finish();await new Promise(r=>setTimeout(r,20));assert.equal(f.supervisor.getState().stopping,true);assert.equal(f.supervisor.getState().reload.error,'server_ready_timeout');assert.equal(f.children.length,3);f.children[1].finish();f.children[2].finish();assert.deepEqual(f.exits,[1]);
});
test('isolated supervisor preserves lock, reloads API via CLI and gracefully stops both children',{timeout:15000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'wis-runtime-'));mkdirSync(join(root,'local'));mkdirSync(join(root,'.local'));
 for(const file of ['start.mjs','control.mjs','supervisor.mjs','group-invite-info.mjs','newsletter-invite-info.mjs'])copyFileSync(new URL(file,import.meta.url),join(root,'local',file));
 writeFileSync(join(root,'local/setup.mjs'),'');
 for(const name of ['server','worker'])writeFileSync(join(root,'local',name+'.mjs'),`import{writeFileSync}from'node:fs';writeFileSync('.local/${name}.ready','yes');process.send?.({type:'wis.ready',generation:process.env.WIS_RUNTIME_GENERATION});process.on('message',m=>{if(m?.type==='wis.shutdown'){writeFileSync('.local/${name}.stopped','yes');process.exit(0);}});`);
 const child=spawn(process.execPath,[join(root,'local/start.mjs')],{cwd:root,stdio:'ignore',windowsHide:true});
 try{
  const until=Date.now()+6000;while((!existsSync(join(root,'.local/worker.ready'))||!existsSync(join(root,'.local/server.ready')))&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
  assert.ok(existsSync(join(root,'.local/worker.ready')));assert.ok(existsSync(join(root,'.local/server.ready')));
  const original=JSON.parse(readFileSync(join(root,'.local/runtime.json'),'utf8'));
  const duplicate=spawn(process.execPath,[join(root,'local/start.mjs')],{cwd:root,stdio:'ignore',windowsHide:true});
  const [duplicateCode]=await once(duplicate,'exit');assert.notEqual(duplicateCode,0);
  assert.equal(JSON.parse(readFileSync(join(root,'.local/runtime.json'),'utf8')).pid,original.pid);
  const reload=spawn(process.execPath,[join(root,'local/control.mjs'),'reload-api'],{cwd:root,stdio:'ignore',windowsHide:true});
  const [reloadCode]=await once(reload,'exit');assert.equal(reloadCode,0);
  const fresh=JSON.parse(readFileSync(join(root,'.local/runtime.json'),'utf8'));assert.equal(fresh.pid,original.pid);assert.equal(fresh.worker_pid,original.worker_pid);assert.notEqual(fresh.server_pid,original.server_pid);assert.equal(fresh.reload.status,'ready');assert.equal(existsSync(join(root,'.local/worker.stopped')),false);
  const ended=once(child,'exit');writeFileSync(join(root,'.local/stop-request'),'stop');
  const [code]=await ended;assert.equal(code,0);assert.ok(existsSync(join(root,'.local/worker.stopped')));assert.ok(existsSync(join(root,'.local/server.stopped')));assert.equal(existsSync(join(root,'.local/runtime.lock')),false);
 }finally{if(child.exitCode===null)child.kill();}
});
