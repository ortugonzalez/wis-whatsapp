import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {buildDataCoverage} from './data-coverage.mjs';import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';
test('label mappings exclude tombstones and empty names, retain stale evidence and never infer colors or counts',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const put=(id,data,date)=>db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('label',id,JSON.stringify(data),date);
 const context={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);
 const reference={methods:[JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.find(m=>m.id==='getlabels')]};
 try{
  put('private-old',{id:'private-old',name:'PRIVATE_DELETED',deleted:true},'2026-01-03T00:00:00Z');
  assert.equal(buildDataCoverage(db).contextual_kinds.some(k=>k.kind==='active_label'),false);
  put('private-stale',{id:'private-stale',name:'PRIVATE_STALE',stale:true,color:3},'2026-01-01T00:00:00Z');
  put('private-empty',{id:'private-empty',name:'  ',color:0},'2026-01-02T00:00:00Z');
  const coverage=buildDataCoverage(db),kind=coverage.contextual_kinds.find(k=>k.kind==='active_label');
  assert.equal(kind.records,2);const name=kind.field_counts.find(f=>f.field==='name');assert.equal(name.records,1);assert.equal(name.stale_records,1);assert.equal(name.snapshot_updated_at,'2026-01-01T00:00:00Z');
  assert.doesNotMatch(JSON.stringify(coverage),/PRIVATE_|private-/);
  const totals=summarizeCapabilityFieldCoverage(reference,coverage,context.window.WIS_WHAPI_FIELD_ALIASES).totals;
  assert.equal(totals.semantic_response_fields_observed,2);assert.equal(totals.response_fields_without_observation,2);
  assert.equal(totals.fresh_response_fields_observed,1);assert.equal(totals.stale_only_response_fields,1);
  for(const [i,name] of ['\t','\r\n','\u00a0','\u2003','\ufeff',' \t\n\u3000 '].entries())put('blank-'+i,{id:'blank-'+i,name},'2026-01-04T00:00:00Z');
  const blankChecked=buildDataCoverage(db).contextual_kinds.find(k=>k.kind==='active_label').field_counts.find(f=>f.field==='name');
  assert.equal(blankChecked.records,1);assert.equal(blankChecked.stale_records,1);assert.equal(blankChecked.snapshot_updated_at,'2026-01-01T00:00:00Z');
 }finally{db.close();}
});
