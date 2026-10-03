import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildDataCoverage} from './data-coverage.mjs';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

test('last text evidence follows the latest message without substituting old text or captions',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE contacts(id TEXT,wa_jid TEXT);CREATE TABLE conversations(id TEXT,wa_chat_id TEXT,title TEXT);CREATE TABLE messages(id TEXT,conversation_id TEXT,wa_message_id TEXT,type TEXT,body TEXT,source TEXT,direction TEXT,delivery_status TEXT,created_at TEXT);CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT);CREATE TABLE read_commands(id TEXT,kind TEXT,status TEXT,target TEXT,error TEXT,updated_at TEXT);');
 const scope={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),scope);
 const methods=['getchat','getchats','getgroup','getgroups'];
 const catalog=JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8'));
 const reference={methods:catalog.methods.filter(m=>methods.includes(m.id)).map(m=>({...m,operations:m.operations.map(op=>({...op,response_fields:{200:op.response_fields['200'].filter(f=>f.path.endsWith('last_message.text.body'))}}))}))};
 db.prepare('INSERT INTO conversations VALUES(?,?,?)').run('g','123@g.us','private title');
 const put=db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)');
 put.run('old','g','old-wa','text','private old text','live','in','delivered','2026-01-01T00:00:00Z');
 put.run('new','g','new-wa','image','private caption','live','in','delivered','2026-01-02T00:00:00Z');
 try {
  for(const [type,body,want] of [['image','private caption',0],['text',' \n\u00a0',0],['text',null,0],['text','private valid text',1]]){
   db.prepare('UPDATE messages SET type=?,body=? WHERE id=?').run(type,body,'new');
   const coverage=buildDataCoverage(db);
   for(const kind of ['chat_last_message','group_last_message']){
    const field=coverage.contextual_kinds.find(k=>k.kind===kind).field_counts.find(f=>f.field==='text_body');
    assert.equal(field.records,want);assert.equal(field.non_empty_text_records,want);
   }
   assert.equal(summarizeCapabilityFieldCoverage(reference,coverage,scope.window.WIS_WHAPI_FIELD_ALIASES).totals.semantic_response_fields_observed,want*4);
   assert.doesNotMatch(JSON.stringify(coverage),/private/);
  }
 }finally{db.close();}
});
