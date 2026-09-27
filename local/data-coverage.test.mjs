import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {buildDataCoverage} from './data-coverage.mjs';

test('coverage reports counts and observed field names without field values or secrets',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE contacts(id TEXT,wa_jid TEXT);CREATE TABLE conversations(id TEXT,wa_chat_id TEXT);CREATE TABLE messages(id TEXT,wa_message_id TEXT,type TEXT);CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT);');
 db.prepare('INSERT INTO contacts VALUES(?,?)').run('c1','549111@s.whatsapp.net');db.prepare('INSERT INTO conversations VALUES(?,?)').run('v1','549111@s.whatsapp.net');db.prepare('INSERT INTO messages VALUES(?,?,?)').run('m1','wamid-1','text');
 db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('chat','549111@s.whatsapp.net',JSON.stringify({id:'private-jid',pinned:false,secret:'hidden',accessToken:'hidden'}),'2026-01-01T00:00:00.000Z');
 db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('chat','549112@s.whatsapp.net',JSON.stringify({id:'other-private-jid',unreadCount:0,[`${'x'.repeat(100)}a`]:1,[`${'x'.repeat(100)}b`]:1}),'2026-01-02T00:00:00.000Z');
 try{const coverage=buildDataCoverage(db);assert.deepEqual(coverage.entities.contacts,{known:1,with_whatsapp_id:1,metadata_records:0});assert.deepEqual(coverage.entities.conversations,{known:1,chat_metadata_records:2});assert.deepEqual(coverage.entities.messages,{stored:1,with_whatsapp_id:1,metadata_records:0});assert.deepEqual(coverage.message_types,[{type:'text',count:1}]);assert.deepEqual(coverage.snapshot_kinds[0].fields,['id','pinned','unreadCount']);assert.deepEqual(coverage.snapshot_kinds[0].field_counts,[{field:'id',records:2},{field:'pinned',records:1},{field:'unreadCount',records:1}]);assert.equal(coverage.snapshot_kinds[0].omitted_fields,2);assert.equal(JSON.stringify(coverage).includes('private-jid'),false);assert.equal(JSON.stringify(coverage).includes('hidden'),false);assert.equal(JSON.stringify(coverage).includes('x'.repeat(100)),false);assert.equal(coverage.history_complete,false);}finally{db.close();}
});
