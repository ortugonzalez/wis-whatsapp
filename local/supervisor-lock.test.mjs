import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claimSupervisorLock,processStartIdentity,releaseSupervisorLock,serializeSupervisorLock,supervisorLockIsActive} from './supervisor-lock.mjs';

const makeOptions=overrides=>({currentPid:100,isAlive:()=>true,readIdentity:()=> 'old-start',readArguments:()=>['node','/app/local/start.mjs'],...overrides});

test('a reused current container pid is treated as a stale legacy lock',()=>{
 assert.equal(supervisorLockIsActive('100',makeOptions()),false);
});

test('a legacy lock owned by a different live WIS supervisor remains protected',()=>{
 assert.equal(supervisorLockIsActive('200',makeOptions()),true);
});

test('a legacy lock whose pid was reused by an unrelated process is stale',()=>{
 assert.equal(supervisorLockIsActive('200',makeOptions({readArguments:()=>['node','/app/local/worker.mjs']})),false);
});

test('a lock with an old process identity is stale even if its pid now runs the supervisor command',()=>{
 const raw=serializeSupervisorLock(200,'old-start');
 assert.equal(supervisorLockIsActive(raw,makeOptions({readIdentity:()=> 'new-start'})),false);
});

test('a lock with matching process identity remains protected',()=>{
 const raw=serializeSupervisorLock(200,'same-start');
 assert.equal(supervisorLockIsActive(raw,makeOptions({readIdentity:()=> 'same-start'})),true);
});

test('a missing process makes its lock stale',()=>{
 assert.equal(supervisorLockIsActive('200',makeOptions({isAlive:()=>false})),false);
});

test('malformed supervisor locks fail closed',()=>{
 assert.throws(()=>supervisorLockIsActive('not-a-pid',makeOptions()),/lock invalid/);
});

test('reads linux process start identity from the stat start-time field',()=>{
 const stat=`123 (node worker) S ${Array.from({length:18},(_,i)=>i+1).join(' ')} 987654 20 21`;
 assert.equal(processStartIdentity(123,()=>stat),'987654');
});

test('claims startup transactionally over an old lock whose pid was reused by this process',()=>{
 const directory=mkdtempSync(join(tmpdir(),'wis-supervisor-lock-'));
 const lockFile=join(directory,'runtime.lock'),databasePath=join(directory,'runtime-lock.sqlite');
 writeFileSync(lockFile,String(process.pid));
 const isAlive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
 try{
  const claim=claimSupervisorLock({databasePath,legacyLockFile:lockFile,currentPid:process.pid,isAlive});
  assert.equal(claim.pid,process.pid);
  releaseSupervisorLock(databasePath,claim);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
