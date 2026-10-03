import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildMessageChatCoverage} from './message-chat-coverage.mjs';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

test('message chat fields require an actual relation and count per message without leaking values',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE messages(conversation_id TEXT);CREATE TABLE conversations(id TEXT PRIMARY KEY,wa_chat_id TEXT,title TEXT)');
 const scope={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),scope);
 const ids=['getmessage','getmessages','getmessagesbychatid'];
 const catalog=JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8'));
 const reference={methods:catalog.methods.filter(m=>ids.includes(m.id)).map(m=>({...m,operations:m.operations.map(op=>({...op,response_fields:{200:op.response_fields['200'].filter(f=>['chat_id','chat_name','messages[].chat_id','messages[].chat_name'].includes(f.path))}}))}))};
 const raw={kind:'conversations',records:1,field_counts:[{field:'wa_chat_id',records:1},{field:'title',records:1}]};
 const totals=()=>summarizeCapabilityFieldCoverage(reference,{storage_kinds:[raw],contextual_kinds:[buildMessageChatCoverage(db)]},scope.window.WIS_WHAPI_FIELD_ALIASES).totals;
 try {
  db.prepare('INSERT INTO conversations VALUES(?,?,?)').run('unrelated','private-unrelated','private name');
  assert.equal(totals().semantic_response_fields_observed,0);
  db.exec("INSERT INTO messages VALUES('missing'),(NULL)");
  assert.equal(totals().semantic_response_fields_observed,0);
  db.prepare('INSERT INTO conversations VALUES(?,?,?)').run('linked','private-linked',' \n\u00a0');
  db.exec("INSERT INTO messages VALUES('linked'),('linked')");
  let c=buildMessageChatCoverage(db);assert.equal(c.records,4);
  assert.equal(c.field_counts[0].records,2);assert.equal(c.field_counts[1].records,0);
  assert.equal(totals().semantic_response_fields_observed,3);
  db.prepare('UPDATE conversations SET title=? WHERE id=?').run('private valid title','linked');
  c=buildMessageChatCoverage(db);assert.equal(c.field_counts[1].records,2);
  assert.equal(totals().semantic_response_fields_observed,6);
  assert.doesNotMatch(JSON.stringify(c),/private/);assert.equal(Object.hasOwn(c,'last_updated_at'),false);
 }finally{db.close();}
});
