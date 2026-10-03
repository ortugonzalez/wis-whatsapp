import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildDataCoverage} from './data-coverage.mjs';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

test('real Business contract counts validated own minutes semantically and keeps freshness separate',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE contacts(id TEXT,wa_jid TEXT);CREATE TABLE conversations(id TEXT,wa_chat_id TEXT);CREATE TABLE messages(id TEXT,wa_message_id TEXT,type TEXT,source TEXT,direction TEXT,created_at TEXT);CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT);CREATE TABLE read_commands(id TEXT,kind TEXT,status TEXT,target TEXT,error TEXT,updated_at TEXT)");
 const context={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);
 const reference={methods:JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.filter(m=>m.id==='getbusinessprofile').map(m=>({...m,operations:m.operations.map(op=>({...op,response_fields:Object.fromEntries(Object.entries(op.response_fields).map(([status,fields])=>[status,fields.filter(f=>/hours\.config\[\]\.(openTime|closeTime)$/.test(f.path))]))}))}))};
 const put=(kind,id,payload)=>db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run(kind,id,JSON.stringify(payload),'2026-10-03T08:00:00Z');
 const summarize=()=>summarizeCapabilityFieldCoverage(reference,buildDataCoverage(db),context.window.WIS_WHAPI_FIELD_ALIASES).totals;
 const profile={available:true,business_hours:{config:[{open_time:'0',close_time:'1440'}]}};
 try{
  put('contact','contact-fixture',{business_profile:profile});put('business','other-fixture',profile);
  assert.equal(summarize().semantic_response_fields_observed,0);
  put('business','wis-5679',{available:true,business_hours:{config:[{open_time:'09:00',close_time:''}]}});
  assert.equal(summarize().semantic_response_fields_observed,0);
  const update=p=>db.prepare("UPDATE snapshots SET payload=? WHERE kind='business' AND resource_id='wis-5679'").run(JSON.stringify(p));
  update(profile);let totals=summarize();assert.equal(totals.response_fields,2);assert.equal(totals.semantic_response_fields_observed,2);assert.equal(totals.exact_response_fields_observed,0);
  update({...profile,available:false,stale:true,last_success_at:'2026-10-02T08:00:00Z'});
  totals=summarize();assert.equal(totals.stale_only_response_fields,2);assert.equal(totals.fresh_response_fields_observed,0);
  let projected=buildDataCoverage(db).contextual_kinds.find(k=>k.kind==='business_minutes');assert.equal(projected.field_counts[0].snapshot_last_success_at,'2026-10-02T08:00:00Z');assert.equal(projected.field_counts[0].snapshot_updated_at,'2026-10-03T08:00:00Z');
  update({...profile,business_hours:{config:[...Array(28).fill({}),{open_time:'0'}]}});assert.equal(summarize().semantic_response_fields_observed,0);projected=buildDataCoverage(db).contextual_kinds.find(k=>k.kind==='business_minutes');assert.equal(projected.truncated,true);assert.equal(projected.row_limit,28);
  assert.doesNotMatch(JSON.stringify(projected),/wis-5679|contact-fixture|other-fixture/);
  const arrayReference={methods:JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.filter(m=>m.id==='getbusinessprofile').map(m=>({...m,operations:m.operations.map(op=>({...op,response_fields:Object.fromEntries(Object.entries(op.response_fields).map(([status,fields])=>[status,fields.filter(f=>f.path==='hours.config')]))}))}))};
  const arrayTotals=()=>summarizeCapabilityFieldCoverage(arrayReference,buildDataCoverage(db),context.window.WIS_WHAPI_FIELD_ALIASES).totals;
  for(const config of [null,'bad',{},0]){update({...profile,business_hours:{config}});assert.equal(arrayTotals().semantic_response_fields_observed,0);}
  update({...profile,business_hours:{config:[]}});assert.equal(arrayTotals().response_fields,1);assert.equal(arrayTotals().semantic_response_fields_observed,1);assert.equal(arrayTotals().exact_response_fields_observed,0);assert.equal(summarize().semantic_response_fields_observed,0);
  update({...profile,stale:true,business_hours:{config:[]}});assert.equal(arrayTotals().stale_only_response_fields,1);assert.equal(arrayTotals().fresh_response_fields_observed,0);
 }finally{db.close();}
});
