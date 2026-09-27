import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('supervisor requests graceful IPC shutdown from both children',{timeout:12000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'wis-runtime-'));mkdirSync(join(root,'local'));mkdirSync(join(root,'.local'));
 for(const file of ['start.mjs','control.mjs'])copyFileSync(new URL(file,import.meta.url),join(root,'local',file));
 writeFileSync(join(root,'local/setup.mjs'),'');
 for(const name of ['server','worker'])writeFileSync(join(root,'local',name+'.mjs'),`import{writeFileSync}from'node:fs';writeFileSync('.local/${name}.ready','yes');process.on('message',m=>{if(m?.type==='wis.shutdown'){writeFileSync('.local/${name}.stopped','yes');process.exit(0);}});`);
 const child=spawn(process.execPath,[join(root,'local/start.mjs')],{cwd:root,stdio:'ignore',windowsHide:true});
 try{
  const until=Date.now()+6000;while((!existsSync(join(root,'.local/worker.ready'))||!existsSync(join(root,'.local/server.ready')))&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
  assert.ok(existsSync(join(root,'.local/worker.ready')));assert.ok(existsSync(join(root,'.local/server.ready')));
  const original=JSON.parse(readFileSync(join(root,'.local/runtime.json'),'utf8')).pid;
  const duplicate=spawn(process.execPath,[join(root,'local/start.mjs')],{cwd:root,stdio:'ignore',windowsHide:true});
  const [duplicateCode]=await once(duplicate,'exit');assert.notEqual(duplicateCode,0);
  assert.equal(JSON.parse(readFileSync(join(root,'.local/runtime.json'),'utf8')).pid,original);
  const ended=once(child,'exit');writeFileSync(join(root,'.local/stop-request'),'stop');
  const [code]=await ended;assert.equal(code,0);assert.ok(existsSync(join(root,'.local/worker.stopped')));assert.ok(existsSync(join(root,'.local/server.stopped')));
  assert.equal(existsSync(join(root,'.local/runtime.lock')),false);
 }finally{if(child.exitCode===null)child.kill();}
});
