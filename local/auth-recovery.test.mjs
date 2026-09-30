import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,resolve} from 'node:path';
import {archiveRejectedAuthDirectory} from './auth-recovery.mjs';

test('revoked Baileys credentials are retained in a private archive before a clean auth directory is created',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'wis-auth-recovery-'));
 try{
  const auth=resolve(root,'baileys-auth');await mkdir(auth,{mode:0o700});
  await writeFile(resolve(auth,'creds.json'),'private-revoked-credentials');
  await writeFile(resolve(auth,'session-key.json'),'private-session-key');
  const archived=archiveRejectedAuthDirectory(auth,{timestamp:1234});
  assert.ok(archived);
  assert.deepEqual((await readdir(auth)),[]);
  assert.deepEqual((await readdir(archived)).sort(),['creds.json','session-key.json']);
  assert.equal(await readFile(resolve(archived,'creds.json'),'utf8'),'private-revoked-credentials');
  if(process.platform!=='win32')assert.equal((await stat(resolve(root,'baileys-auth-revoked'))).mode&0o777,0o700);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an absent auth directory is created without a fake archive and unrelated directories are rejected',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'wis-auth-recovery-empty-'));
 try{
  const auth=resolve(root,'baileys-auth');
  assert.equal(archiveRejectedAuthDirectory(auth,{timestamp:1}),null);
  assert.deepEqual(await readdir(auth),[]);
  assert.throws(()=>archiveRejectedAuthDirectory(resolve(root,'other')),/invalid_auth_directory/);
 }finally{await rm(root,{recursive:true,force:true});}
});
