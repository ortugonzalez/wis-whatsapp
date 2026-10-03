import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';
const context={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);
const reference={methods:JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.filter(m=>m.id==='getcontactprofile')};
test('contact profile push name requires nonempty text and preserves stale-only evidence',()=>{
 const summarize=(non_empty_text_records,stale_non_empty_text_records=0,kind='contact')=>summarizeCapabilityFieldCoverage(reference,{snapshot_kinds:[{kind,field_counts:[{field:'notify',records:1,non_empty_text_records,stale_non_empty_text_records,stale_records:stale_non_empty_text_records}]}]},context.window.WIS_WHAPI_FIELD_ALIASES).totals;
 assert.equal(summarize(0).semantic_response_fields_observed,0);
 assert.equal(summarize(1).semantic_response_fields_observed,1);
 assert.equal(summarize(1,1).stale_only_response_fields,1);assert.equal(summarize(1,1).fresh_response_fields_observed,0);
 assert.equal(summarize(1,0,'profile').semantic_response_fields_observed,0);
});

test('contact names never use normalized display labels as address book evidence',()=>{
 const all=JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8'));
 for(const id of ['getcontacts','getcontact']){
  const ref={methods:all.methods.filter(m=>m.id===id)};
  const sum=rows=>summarizeCapabilityFieldCoverage(ref,{snapshot_kinds:rows},context.window.WIS_WHAPI_FIELD_ALIASES).totals;
  const normalized={kind:'contacts',field_counts:[{field:'display_name',records:99,non_empty_text_records:99}]};
  assert.equal(sum([normalized]).semantic_response_fields_observed,0,id);
  assert.equal(sum([normalized,{kind:'contact',field_counts:[{field:'name',records:1,non_empty_text_records:0}]}]).semantic_response_fields_observed,0,id);
  const observed=sum([normalized,{kind:'contact',field_counts:[{field:'name',records:1,non_empty_text_records:1,stale_records:1,stale_non_empty_text_records:1}]}]);
  assert.equal(observed.semantic_response_fields_observed,1,id);assert.equal(observed.stale_only_response_fields,1,id);assert.equal(observed.fresh_response_fields_observed,0,id);
  const key=id==='getcontacts'?'contacts[].name':'name';assert.equal(context.window.WIS_WHAPI_FIELD_ALIASES[id].fields[key][0].field,'name');
 }
});
