import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';
test('raw status object cannot replace reviewed nonempty contact status text in coverage or UI',()=>{
 const scope={window:{},capabilities(){},fmt:String,exactObservedPath:v=>v};
 vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),scope);
 vm.runInNewContext(readFileSync(new URL('./public/capability-audit.js',import.meta.url),'utf8'),scope);
 const method=JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.find(m=>m.id==='getcontact');
 const reference={methods:[{...method,operations:method.operations.map(op=>({...op,response_fields:{200:op.response_fields['200'].filter(f=>f.path==='status')}}))}]};
 const row={capability_id:'getcontact',field_path:'status',direction:'response'};
 scope.window.WIS_COVERAGE_AVAILABLE=true;
 for(const [textCount,stale,want] of [[0,0,0],[1,0,1],[1,1,1]]){
  const fields=[{field:'status',records:1,non_empty_text_records:0,stale_records:1-stale},{field:'status.status',records:1,non_empty_text_records:textCount,stale_records:stale,stale_non_empty_text_records:stale}];
  const totals=summarizeCapabilityFieldCoverage(reference,{snapshot_kinds:[{kind:'contact',records:1,field_counts:fields}]},scope.window.WIS_WHAPI_FIELD_ALIASES).totals;
  assert.equal(totals.exact_response_fields_observed,0);assert.equal(totals.semantic_response_fields_observed,want);assert.equal(totals.fresh_response_fields_observed,stale?0:want);
  scope.window.WIS_OBSERVED_FIELD_MAP=new Map(fields.map(f=>[f.field,[{...f,kind:'contact',total:1}]]));
  const evidence=scope.observedVariableEvidence(row);assert.doesNotMatch(evidence,/Ruta exacta/);assert.match(evidence,textCount?/Equivalencia observada/:/sin observación/);
  if(stale)assert.match(evidence,/marcados obsoletos/);else assert.doesNotMatch(evidence,/marcados obsoletos/);
 }
});
