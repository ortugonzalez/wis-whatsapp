import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('WHAPI field evidence labels stale snapshots without converting them into fresh coverage',()=>{
 const window={WIS_COVERAGE_AVAILABLE:true,WIS_WHAPI_FIELD_ALIASES:{getgroup:{source_kinds:['group'],fields:{'name':[{kind:'group',field:'subject',note:'nombre del grupo'}]}}},WIS_OBSERVED_FIELD_MAP:new Map([['subject',[{kind:'group',records:2,total:3,stale_records:1,snapshot_updated_at:'2026-01-01T00:00:00.000Z'}]]])};
 const context={window,capabilities:async()=>{},Map,URLSearchParams,document:{},fmt:value=>value};
 runInNewContext(readFileSync(new URL('./public/capability-audit.js',import.meta.url),'utf8'),context,{timeout:1000});
 const evidence=context.observedVariableEvidence({direction:'response',capability_id:'getgroup',field_path:'name'});
 assert.match(evidence,/2\/3/);
 assert.match(evidence,/1 registro\(s\) de evidencia marcados obsoletos/);
 assert.doesNotMatch(evidence,/fresco|actual/i);
});
