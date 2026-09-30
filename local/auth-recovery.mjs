import {chmodSync,existsSync,lstatSync,mkdirSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export function archiveRejectedAuthDirectory(authDir,{timestamp=Date.now()}={}){
 const source=resolve(authDir);
 if(!source.endsWith(`${process.platform==='win32'?'\\':'/'}baileys-auth`))throw new Error('invalid_auth_directory');
 const parent=dirname(source),archiveRoot=resolve(parent,'baileys-auth-revoked');
 mkdirSync(parent,{recursive:true,mode:0o700});
 mkdirSync(archiveRoot,{recursive:true,mode:0o700});
 if(lstatSync(archiveRoot).isSymbolicLink())throw new Error('invalid_auth_archive_directory');
 chmodSync(archiveRoot,0o700);
 const archivePath=resolve(archiveRoot,`session-${timestamp}-${randomUUID()}`);
 let moved=false;
 try{
  if(existsSync(source)){
   const info=lstatSync(source);
   if(info.isSymbolicLink()||!info.isDirectory())throw new Error('invalid_auth_directory');
   renameSync(source,archivePath);moved=true;chmodSync(archivePath,0o700);
  }
  mkdirSync(source,{recursive:true,mode:0o700});chmodSync(source,0o700);
  return moved?archivePath:null;
 }catch(error){
  if(moved&&!existsSync(source))renameSync(archivePath,source);
  throw error;
 }
}
