import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {verifyBackup} from '../../local/backup-check.mjs';
test('QA: orphan foreign keys reject backup and remove only verification copy',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'wis-qa-backup-')),source=resolve(dir,'source.sqlite'),scratch=resolve(dir,'scratch');
 const db=new DatabaseSync(source);db.exec(readFileSync(new URL('../../local/schema.sql',import.meta.url),'utf8'));
 db.exec('PRAGMA foreign_keys=OFF');db.prepare('INSERT INTO messages(id,conversation_id,direction,created_at) VALUES(?,?,?,?)').run('orphan','missing','in','2026-09-27T00:00:00Z');db.close();
 const before=readFileSync(source);await assert.rejects(verifyBackup(source,{tempRoot:scratch}),/backup_foreign_keys_failed/);
 assert.deepEqual(readFileSync(source),before);assert.deepEqual(readdirSync(scratch),[]);
});
