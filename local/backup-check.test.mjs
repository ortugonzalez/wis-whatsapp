import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {verifyBackup,databaseContentDigest} from './backup-check.mjs';
test('content comparison detects same-count changes and preserves SQLite types without insertion-order dependence',()=>{
 const a=new DatabaseSync(':memory:'),b=new DatabaseSync(':memory:');
 try{
  for(const db of [a,b])db.exec('CREATE TABLE sample(k TEXT,v);');
  const rows=[['integer',9223372036854775807n],['blob',Buffer.from([0,255])],['null',null],['text','PRIVATE'],['real',1.5]];
  for(const row of rows)a.prepare('INSERT INTO sample VALUES(?,?)').run(...row);
  for(const row of [...rows].reverse())b.prepare('INSERT INTO sample VALUES(?,?)').run(...row);
  assert.equal(databaseContentDigest(a),databaseContentDigest(b));
  b.prepare('UPDATE sample SET v=? WHERE k=?').run('CHANGED','text');assert.notEqual(databaseContentDigest(a),databaseContentDigest(b));
  b.prepare('UPDATE sample SET v=? WHERE k=?').run('PRIVATE','text');
  b.prepare('UPDATE sample SET v=? WHERE k=?').run('9223372036854775807','integer');assert.notEqual(databaseContentDigest(a),databaseContentDigest(b));
 }finally{a.close();b.close();}
});
test('backup restore validates schema/integrity and never changes source bytes',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'wis-backup-')),source=resolve(root,'backup.sqlite'),tempRoot=resolve(root,'verify');
 const db=new DatabaseSync(source);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO settings VALUES(?,?)').run('test','PRIVATE');db.close();
 const original=readFileSync(source);const report=await verifyBackup(source,{tempRoot});
 assert.equal(report.status,'verified');assert.equal(report.counts.settings,1);assert.equal(JSON.stringify(report).includes('PRIVATE'),false);assert.deepEqual(readFileSync(source),original);assert.deepEqual(readdirSync(tempRoot),[]);
 assert.equal(report.content_verified,true);assert.equal(report.content_digest,undefined);assert.equal(report.session_included,false);
});
test('corrupt, incomplete and incompatible version backups fail safely',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'wis-invalid-backup-')),tempRoot=resolve(root,'verify');
 const corrupt=resolve(root,'corrupt.sqlite');writeFileSync(corrupt,'not sqlite SECRET');await assert.rejects(verifyBackup(corrupt,{tempRoot}),/backup_unreadable/);
 const missing=resolve(root,'missing.sqlite');const db=new DatabaseSync(missing);db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');db.close();await assert.rejects(verifyBackup(missing,{tempRoot}),/backup_schema_missing/);
 const version=resolve(root,'version.sqlite');const newer=new DatabaseSync(version);newer.exec('PRAGMA user_version=999');newer.close();await assert.rejects(verifyBackup(version,{tempRoot}),/backup_version_unsupported/);assert.deepEqual(readdirSync(tempRoot),[]);
});
test('missing or changed required triggers and indexes reject while additive objects are allowed',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'wis-schema-backup-')),source=resolve(root,'backup.sqlite'),tempRoot=resolve(root,'verify');
 const db=new DatabaseSync(source);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.exec('CREATE INDEX extra_settings_index ON settings(value)');db.close();
 assert.equal((await verifyBackup(source,{tempRoot})).status,'verified');
 const changed=new DatabaseSync(source);changed.exec('DROP TRIGGER message_created');changed.close();
 await assert.rejects(verifyBackup(source,{tempRoot}),/backup_schema_incompatible/);
 const replaced=new DatabaseSync(source);replaced.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));replaced.exec('DROP INDEX messages_chat; CREATE INDEX messages_chat ON messages(type)');replaced.close();
 await assert.rejects(verifyBackup(source,{tempRoot}),/backup_schema_incompatible/);
});
test('missing foreign key declaration rejects even when foreign_key_check finds no orphans',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'wis-fk-backup-')),source=resolve(root,'backup.sqlite');
 const db=new DatabaseSync(source);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8').replace('contact_id TEXT REFERENCES contacts(id)','contact_id TEXT'));db.close();
 await assert.rejects(verifyBackup(source,{tempRoot:resolve(root,'verify')}),/backup_schema_incompatible/);
});
