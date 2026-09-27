import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, unlinkSync, writeFileSync, readFileSync, openSync, closeSync } from 'node:fs';
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
const children = ['server.mjs', 'worker.mjs'].map(file => spawn(process.execPath, [resolve(root, 'local', file)], { cwd: root, env: process.env, stdio: ['inherit','inherit','inherit','ipc'], windowsHide: true }));
writeFileSync(runtimeFile,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}),{mode:0o600});
let stopping = false;
function stop(code = 0) {
 if(stopping)return;stopping=true;clearInterval(control);
 for(const child of children)if(child.connected)child.send({type:'wis.shutdown'},()=>{});
 const deadline=setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill();process.exit(code);},15000);
 const finish=()=>{if(children.every(child=>child.exitCode!==null||child.signalCode!==null)){clearTimeout(deadline);process.exit(code);}};
 for(const child of children)child.once('exit',finish);finish();
}
const control=setInterval(()=>{if(existsSync(stopFile)){unlinkSync(stopFile);stop();}},500);
for (const child of children) child.on('exit', code => { if (!stopping) stop(code || 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
