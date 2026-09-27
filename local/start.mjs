import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, unlinkSync, writeFileSync, readFileSync, openSync, closeSync } from 'node:fs';
import {createSupervisor} from './supervisor.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
try { process.loadEnvFile(resolve(root, '.env.local')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await import('./setup.mjs');
const lockFile=resolve(root,'.local/runtime.lock');
const runtimeFile=resolve(root,'.local/runtime.json');
if(existsSync(lockFile)){
 const prior=Number(readFileSync(lockFile,'utf8'));
 if(!Number.isSafeInteger(prior)||prior<=0)throw Error('Supervisor lock invalid; inspect local processes before recovery.');
 let alive=true;try{process.kill(prior,0);}catch(error){if(error.code==='ESRCH')alive=false;else throw error;}
 if(alive)throw Error('Another WIS supervisor is already running.');
 unlinkSync(lockFile);
}
const lock=openSync(lockFile,'wx',0o600);writeFileSync(lock,String(process.pid));closeSync(lock);
process.on('exit',()=>{
 try{if(readFileSync(lockFile,'utf8')===String(process.pid))unlinkSync(lockFile);}catch{}
 try{if(JSON.parse(readFileSync(runtimeFile,'utf8')).pid===process.pid)unlinkSync(runtimeFile);}catch{}
});
const stopFile=resolve(root,'.local/stop-request');
if(existsSync(stopFile))unlinkSync(stopFile);
const reloadFile=resolve(root,'.local/reload-api-request');
if(existsSync(reloadFile))unlinkSync(reloadFile);
const supervisor=createSupervisor({spawnChild:(kind,generation)=>spawn(process.execPath,[resolve(root,'local',kind+'.mjs')],{cwd:root,env:{...process.env,WIS_RUNTIME_GENERATION:generation},stdio:['inherit','inherit','inherit','ipc'],windowsHide:true}),publish:state=>writeFileSync(runtimeFile,JSON.stringify({pid:process.pid,...state}),{mode:0o600}),exit:code=>process.exit(code)});
setInterval(()=>{if(existsSync(stopFile)){unlinkSync(stopFile);supervisor.stop();return;}if(existsSync(reloadFile)){try{const request=JSON.parse(readFileSync(reloadFile,'utf8'));supervisor.requestReload(request.id);}catch{}finally{unlinkSync(reloadFile);}}},500);
process.on('SIGINT',()=>supervisor.stop());
process.on('SIGTERM',()=>supervisor.stop());
