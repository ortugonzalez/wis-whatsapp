import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdirSync,realpathSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
function inspect(db) {
 if(db.prepare('PRAGMA integrity_check').all().some(row=>row.integrity_check!=='ok'))throw Error('backup_integrity_failed');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('backup_foreign_keys_failed');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version!==0)throw Error('backup_version_unsupported');
 const expected=new DatabaseSync(':memory:');
 try {
  expected.exec(schema);const counts={};
  for(const {name} of expected.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
   if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name))throw Error('backup_schema_missing');
   const actual=db.prepare(`PRAGMA table_info("${name}")`).all();
   for(const column of expected.prepare(`PRAGMA table_info("${name}")`).all()) {
    if(!actual.some(c=>c.name===column.name&&c.type===column.type&&c.pk===column.pk&&c.notnull===column.notnull))throw Error('backup_schema_incompatible');
   }
   const uniqueSignatures=connection=>connection.prepare(`PRAGMA index_list("${name}")`).all().filter(index=>index.unique).map(index=>JSON.stringify(connection.prepare('SELECT name,coll,desc FROM pragma_index_xinfo(?) WHERE key=1 ORDER BY seqno').all(index.name)));
   const actualUnique=uniqueSignatures(db);
   if(uniqueSignatures(expected).some(signature=>!actualUnique.includes(signature)))throw Error('backup_schema_incompatible');
   const foreignKeys=connection=>connection.prepare(`PRAGMA foreign_key_list("${name}")`).all().map(({table,from,to,on_update,on_delete,match})=>JSON.stringify({table,from,to,on_update,on_delete,match}));
   const actualForeign=foreignKeys(db);
   if(foreignKeys(expected).some(signature=>!actualForeign.includes(signature)))throw Error('backup_schema_incompatible');
   counts[name]=db.prepare(`SELECT count(*) count FROM "${name}"`).get().count;
  }
  const normalize=sql=>sql.replace(/\bIF\s+NOT\s+EXISTS\b/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
  for(const object of expected.prepare("SELECT type,name,sql FROM sqlite_schema WHERE type IN ('trigger','index') AND sql IS NOT NULL").all()) {
   const actual=db.prepare('SELECT sql FROM sqlite_schema WHERE type=? AND name=?').get(object.type,object.name);
   if(!actual?.sql||normalize(actual.sql)!==normalize(object.sql))throw Error('backup_schema_incompatible');
  }
  return {user_version:version,counts};
 } finally{expected.close();}
}
export async function verifyBackup(source,{tempRoot}={}) {
 let sourceDb,restoredDb,tempDir,copy;
 try {
  if(!tempRoot)throw Error('backup_temp_root_required');
  mkdirSync(tempRoot,{recursive:true,mode:0o700});
  tempDir=mkdtempSync(resolve(realpathSync(tempRoot),'verify-'));copy=resolve(tempDir,'restored.sqlite');
  sourceDb=new DatabaseSync(realpathSync(source),{readOnly:true});
  sourceDb.exec('BEGIN');const original=inspect(sourceDb);
  await backup(sourceDb,copy);
  restoredDb=new DatabaseSync(copy,{readOnly:true});const restored=inspect(restoredDb);
  if(JSON.stringify(original)!==JSON.stringify(restored))throw Error('backup_restore_mismatch');
  return {status:'verified',...restored};
 } catch(error) {
  const safe=new Set(['backup_temp_root_required','backup_integrity_failed','backup_foreign_keys_failed','backup_version_unsupported','backup_schema_missing','backup_schema_incompatible','backup_restore_mismatch']);
  throw Error(safe.has(error?.message)?error.message:'backup_unreadable');
 } finally {
  restoredDb?.close();sourceDb?.close();
  if(copy)for(const path of [copy,copy+'-wal',copy+'-shm'])try{unlinkSync(path);}catch(error){if(error.code!=='ENOENT')throw Error('backup_cleanup_failed');}
  if(tempDir)rmdirSync(tempDir);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  const base=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../.local/backups'));
  const source=realpathSync(resolve(process.argv[2]||''));const rel=relative(base,source);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('backup_path_rejected');
  console.log(JSON.stringify(await verifyBackup(source,{tempRoot:base})));
 } catch {console.error(JSON.stringify({status:'failed',error:'backup_verification_failed'}));process.exitCode=1;}
}
