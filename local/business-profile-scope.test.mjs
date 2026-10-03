import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';
test('own Business response coverage cannot be supplied by contact profiles',()=>{
 const context={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);
 const aliases=context.window.WIS_WHAPI_FIELD_ALIASES;
 const reference={methods:JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.filter(m=>m.id==='getbusinessprofile')};
 const fields=['id','address','description','email','hours','hours.config','business_profile.business_hours','business_profile.business_hours.config[]'];
 const contact={kind:'contact',records:1,field_counts:fields.map(field=>({field,records:1,non_empty_text_records:1}))};
 const summarize=kinds=>summarizeCapabilityFieldCoverage(reference,{snapshot_kinds:kinds},aliases).totals;
 const onlyContacts=summarize([contact]);assert.equal(onlyContacts.exact_response_fields_observed+onlyContacts.semantic_response_fields_observed,0);
 const own={kind:'business',records:1,field_counts:[{field:'business_hours',records:1},{field:'business_hours.config[]',records:1}]};
 const ownTotals=summarize([contact,own]);assert.equal(ownTotals.semantic_response_fields_observed,2);
});
