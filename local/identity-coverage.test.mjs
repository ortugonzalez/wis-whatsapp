import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {buildUnambiguousIdentityCoverage} from './identity-coverage.mjs';import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';
test('identity coverage excludes conflicts and cross-candidate collisions without exposing identifiers',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT)');
 const put=(lid,pn,extra={})=>db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('identity',lid,JSON.stringify({lid,pn,source:'contacts',status:'observed',conflict:false,...extra}),'2026-10-03T00:00:00Z');
 try{
  put('1@lid','11111111@s.whatsapp.net',{stale:true});
  let aggregate=buildUnambiguousIdentityCoverage(db);assert.equal(aggregate.records,1);assert.equal(aggregate.field_counts[0].stale_records,1);assert.doesNotMatch(JSON.stringify(aggregate),/@lid|whatsapp\.net/);
  put('2@lid','22222222@s.whatsapp.net',{conflict:true,candidate_pns:['11111111@s.whatsapp.net','22222222@s.whatsapp.net']});
  assert.equal(buildUnambiguousIdentityCoverage(db).records,0);
  put('3@lid','33333333@s.whatsapp.net');put('4@lid','33333333@s.whatsapp.net');assert.equal(buildUnambiguousIdentityCoverage(db).records,0);
  put('5@lid','55555555@s.whatsapp.net',{source:'unknown'});put('6@lid','66666666@s.whatsapp.net',{status:'conflict'});put('7@lid','not-a-phone');
  assert.equal(buildUnambiguousIdentityCoverage(db).records,0);
  const context={window:{}};vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);
  const reference={methods:JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.filter(m=>['getidbylid','getlidbyid'].includes(m.id))};
  const raw={kind:'identity',field_counts:['id','lid','pn'].map(field=>({field,records:7}))};
  const totals=()=>summarizeCapabilityFieldCoverage(reference,{snapshot_kinds:[raw],contextual_kinds:[buildUnambiguousIdentityCoverage(db)]},context.window.WIS_WHAPI_FIELD_ALIASES).totals;
  assert.equal(totals().exact_response_fields_observed+totals().semantic_response_fields_observed,0);
  put('8@lid','88888888@s.whatsapp.net',{stale:true});const observed=totals();assert.ok(observed.exact_response_fields_observed+observed.semantic_response_fields_observed>0);assert.equal(observed.fresh_response_fields_observed,0);assert.ok(observed.stale_only_response_fields>0);
 }finally{db.close();}
});
