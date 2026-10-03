import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {readUpsertActivity} from './receive-activity.mjs';
test('upsert summary rejects malformed aggregates and exposes only sanitized counts',()=>{
 let row;const db={prepare:()=>({get:()=>row})};assert.equal(readUpsertActivity(db),null);
 const valid={source:'baileys.messages.upsert',observed_at:'2026-10-03T00:00:00Z',upsert_type:'notify',envelopes:3,inbound:1,outbound:1,unknown_direction:1,without_content:2,secret:'private-value'};
 row={payload:JSON.stringify(valid)};const result=readUpsertActivity(db);assert.equal(result.envelopes,3);assert.equal(result.persistence_confirmed,false);assert.doesNotMatch(JSON.stringify(result),/private|secret/);
 for(const patch of [{envelopes:4},{inbound:-1},{without_content:4},{outbound:1.5},{observed_at:'bad'},{upsert_type:'private'},{source:'wrong'}]){row={payload:JSON.stringify({...valid,...patch})};assert.equal(readUpsertActivity(db),null);}
 row={payload:'broken'};assert.equal(readUpsertActivity(db),null);
 const source=readFileSync(new URL('./public/live.js',import.meta.url),'utf8');assert.match(source.trimStart(),/^['"]use strict['"]/);const code=source.split('\n').find(line=>line.startsWith('function upsertActivitySummary('));const context={kv:(k,v)=>k+': '+v,fmt:String};runInNewContext(code,context);assert.match(context.upsertActivitySummary(null),/sin observación/);assert.match(context.upsertActivitySummary(result),/1 \/ 1 \/ 1/);assert.match(context.upsertActivitySummary(result),/No confirma mensajes únicos/);
});
