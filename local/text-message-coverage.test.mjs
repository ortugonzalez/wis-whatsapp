import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildTextMessageCoverage} from './text-message-coverage.mjs';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

test('text body coverage excludes captions, fallbacks and empty bodies for all message methods',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE messages(type TEXT,body TEXT)');
 const put=db.prepare('INSERT INTO messages VALUES(?,?)');
 const scope={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),scope);
 const aliases=scope.window.WIS_WHAPI_FIELD_ALIASES;
 const catalog=JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8'));
 const methods=['getmessage','getmessages','getmessagesbychatid'];
 const reference={methods:catalog.methods.filter(m=>methods.includes(m.id)).map(m=>({...m,operations:m.operations.map(op=>({...op,response_fields:{200:op.response_fields['200'].filter(f=>['text.body','messages[].text.body'].includes(f.path))}}))}))};
 try {
  for(const [type,body] of [['image','private caption'],['document','private filename'],['unsupported','local fallback'],['text',''],['text',' \n\t\u00a0'],['text',null]])put.run(type,body);
  const raw={kind:'messages',records:6,field_counts:[{field:'body',records:5}]};
  let context=buildTextMessageCoverage(db);
  assert.equal(context.records,3);assert.equal(context.field_counts[0].records,0);
  const emptyTotals=summarizeCapabilityFieldCoverage(reference,{storage_kinds:[raw],contextual_kinds:[context]},aliases).totals;
  assert.equal(emptyTotals.semantic_response_fields_observed,0);
  assert.equal(emptyTotals.exact_response_fields_observed,0);
  put.run('text','private actual text');context=buildTextMessageCoverage(db);
  assert.equal(context.records,4);assert.equal(context.field_counts[0].non_empty_text_records,1);
  const totals=summarizeCapabilityFieldCoverage(reference,{storage_kinds:[raw],contextual_kinds:[context]},aliases).totals;
  assert.equal(totals.semantic_response_fields_observed,3);
  assert.doesNotMatch(JSON.stringify(context),/private|fallback/);
  assert.equal(Object.hasOwn(context,'last_updated_at'),false);
 }finally{db.close();}
});
