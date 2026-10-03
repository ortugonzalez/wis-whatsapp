import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';
const context={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);
const reference={methods:[JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.find(m=>m.id==='getbotlist')]};
const field=(field,stale_records=0)=>({field,records:1,stale_records});
const summarize=rows=>summarizeCapabilityFieldCoverage(reference,{snapshot_kinds:rows},context.window.WIS_WHAPI_FIELD_ALIASES).totals;
test('bot catalog failures and unrelated identities never imply bot fields; retained stale evidence stays stale',()=>{
 const failed={kind:'bot_list',field_counts:['available','error','status_code','last_attempt_at','stale'].map(x=>field(x,1))};
 const unrelated={kind:'contact',field_counts:['bots','bots[0].id','bots[0].persona_id','count'].map(x=>field(x))};
 const absent=summarize([failed,unrelated]);
 assert.equal(absent.response_fields,4);assert.equal(absent.response_fields_without_observation,4);
 const stale=summarize([{kind:'bot_list',field_counts:['bots','bots[0].jid','bots[0].persona_id'].map(x=>field(x,1))}]);
 assert.equal(stale.exact_response_fields_observed,2);assert.equal(stale.semantic_response_fields_observed,0);
 assert.equal(stale.stale_only_response_fields,2);assert.equal(stale.fresh_response_fields_observed,0);
 assert.equal(stale.response_fields_without_observation,2);
});
