import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const startScriptArgument=value=>typeof value==='string'&&/(?:^|[\\/])local[\\/]start\.mjs$/.test(value);

export function processStartIdentity(pid,read=readFileSync){
 try{
  const stat=read(`/proc/${pid}/stat`,'utf8');
  const close=stat.lastIndexOf(')');
  if(close<0)return null;
  const fields=stat.slice(close+2).trim().split(/\s+/);
  const start=fields[19];
  return /^\d+$/.test(start??'')?start:null;
 }catch{return null;}
}

export function processArguments(pid,read=readFileSync){
 try{return read(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);}catch{return null;}
}

export function supervisorLockIsActive(raw,{currentPid,isAlive,readIdentity=processStartIdentity,readArguments=processArguments}={}){
 let value;
 try{value=String(raw).trim().startsWith('{')?JSON.parse(raw):null;}catch{value=null;}
 if(!value){
  const pid=Number(String(raw).trim());
  if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Supervisor lock invalid; inspect local processes before recovery.');
  value={pid,legacy:true};
 }
 const pid=Number(value?.pid);
 if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Supervisor lock invalid; inspect local processes before recovery.');

 // A container restart can reuse its former supervisor PID. The current
 // process cannot simultaneously be a second process with the same PID.
 if(pid===currentPid)return false;
 let alive=false;
 try{alive=isAlive(pid);}catch(error){if(error.code==='ESRCH')alive=false;else throw error;}
 if(!alive)return false;

 const args=readArguments(pid);
 // On Linux, reject stale locks that now point at an unrelated process.
 // On platforms without /proc, retain the conservative PID-only behavior.
 if(args){
  if(!args.some(startScriptArgument))return false;
  if(!value.legacy&&typeof value.process_start_identity==='string'){
   const current=readIdentity(pid);
   if(current&&current!==value.process_start_identity)return false;
  }
 }
 return true;
}

export function serializeSupervisorLock(pid,identity=processStartIdentity(pid)){
 return JSON.stringify({pid,process_start_identity:identity});
}

export function claimSupervisorLock({databasePath,legacyLockFile,currentPid,isAlive,readIdentity=processStartIdentity,readArguments=processArguments,readFile=readFileSync}){
 mkdirSync(dirname(databasePath),{recursive:true,mode:0o700});
 const database=new DatabaseSync(databasePath);
 database.exec('PRAGMA busy_timeout=5000');
 database.exec('CREATE TABLE IF NOT EXISTS wis_supervisor_lock (singleton INTEGER PRIMARY KEY CHECK(singleton=1), pid INTEGER NOT NULL, process_start_identity TEXT)');
 database.exec('BEGIN IMMEDIATE');
 const identity=readIdentity(currentPid);
 const options={currentPid,isAlive,readIdentity,readArguments};
 try{
  const existing=database.prepare('SELECT pid,process_start_identity FROM wis_supervisor_lock WHERE singleton=1').get();
  if(existing&&supervisorLockIsActive(JSON.stringify(existing),options))throw Error('Another WIS supervisor is already running.');
  try{
   const legacy=readFile(legacyLockFile,'utf8');
   if(supervisorLockIsActive(legacy,options))throw Error('Another WIS supervisor is already running.');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  database.prepare('INSERT INTO wis_supervisor_lock(singleton,pid,process_start_identity) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET pid=excluded.pid,process_start_identity=excluded.process_start_identity').run(currentPid,identity);
  database.exec('COMMIT');
  return {pid:currentPid,process_start_identity:identity};
 }catch(error){try{database.exec('ROLLBACK');}catch{}throw error;}
 finally{database.close();}
}

export function releaseSupervisorLock(databasePath,claim){
 const database=new DatabaseSync(databasePath);
 try{
  database.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  database.prepare('DELETE FROM wis_supervisor_lock WHERE singleton=1 AND pid=? AND process_start_identity IS ?').run(claim.pid,claim.process_start_identity);
  database.exec('COMMIT');
 }catch(error){try{database.exec('ROLLBACK');}catch{}throw error;}
 finally{database.close();}
}
