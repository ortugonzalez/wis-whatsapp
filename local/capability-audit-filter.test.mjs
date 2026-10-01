import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./public/capability-audit.js',import.meta.url),'utf8');
const helper=source.match(/function filterCapabilityMethodsByCoverage\(methods,filter\)\{[\s\S]*?\n\}/)?.[0];
if(!helper)throw new Error('coverage_filter_helper_missing');
const selector=source.match(/function selectCapabilityForCoverage\(methods,filter,selected=''\)\{[\s\S]*?\n\}/)?.[0];
if(!selector)throw new Error('coverage_selector_helper_missing');
const filter=(methods,kind)=>JSON.parse(runInNewContext(`${helper};JSON.stringify(filterCapabilityMethodsByCoverage(${JSON.stringify(methods)},${JSON.stringify(kind)}).map(method=>method.id))`));
const selected=(methods,kind,current='')=>runInNewContext(`${helper};${selector};selectCapabilityForCoverage(${JSON.stringify(methods)},${JSON.stringify(kind)},${JSON.stringify(current)})`);
const methods=[
  {id:'partial-b',response_fields:5,response_fields_without_observation:4},
  {id:'complete',response_fields:2,response_fields_without_observation:0},
  {id:'partial-a',response_fields:3,response_fields_without_observation:1},
  {id:'no-response',response_fields:0,response_fields_without_observation:0},
];

test('unobserved filter prioritizes response gaps and excludes methods without response fields',()=>{
  assert.deepEqual(filter(methods,'unobserved'),['partial-b','partial-a']);
});

test('complete filter includes only methods with response fields and no remaining gaps',()=>{
  assert.deepEqual(filter(methods,'complete'),['complete']);
});

test('all filter retains every method in source order',()=>{
  assert.deepEqual(filter(methods,''),['partial-b','complete','partial-a','no-response']);
});

test('choosing a coverage category selects an eligible method so the table follows the filter',()=>{
  assert.equal(selected(methods,'unobserved'),'partial-b');
  assert.equal(selected(methods,'complete'),'complete');
  assert.equal(selected(methods,'unobserved','partial-a'),'partial-a');
  assert.equal(selected(methods,'complete','partial-a'),'complete');
  assert.equal(selected(methods,'unobserved','no-response'),'partial-b');
});

test('an empty category selection does not silently fall back to all methods',()=>{
  assert.equal(selected(methods,'complete',''),'complete');
  assert.equal(selected([{id:'none',response_fields:0,response_fields_without_observation:0}],'unobserved',''),'');
});
