import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeAccountLimitsSnapshot} from './account-limits-snapshot.mjs';

const successAt='2026-10-02T08:00:00.000Z';
const attemptAt='2026-10-02T08:15:00.000Z';
const quota={available:true,response_verified:true,total_quota:120,used_quota:35,cycle_start_timestamp:'1700000000',cycle_end_timestamp:'1700600000',server_sent_timestamp:'1700000001',capping_status:'FIRST_WARNING',mv_status:'ACTIVE',ote_status:'ELIGIBLE'};
const timelock={available:true,response_verified:true,is_active:false,time_enforcement_ends:'1700000100',enforcement_type:'DEFAULT'};

test('account limits preserve independently verified timestamps for both sections',()=>{
  const snapshot=mergeAccountLimitsSnapshot({}, {quota,timelock},successAt);
  assert.equal(snapshot.quota.last_attempt_at,successAt);
  assert.equal(snapshot.quota.last_success_at,successAt);
  assert.equal(snapshot.timelock.last_success_at,successAt);
  assert.equal(snapshot.response_verified,true);
  assert.equal(snapshot.partial,false);
});

test('a failed subsection keeps only its prior allowlisted values and is visibly stale',()=>{
  const previous=mergeAccountLimitsSnapshot({}, {quota,timelock},successAt);
  const next=mergeAccountLimitsSnapshot(previous,{quota:{...quota,used_quota:40},timelock:{available:false,response_verified:false,error:'provider_error',status_code:503}},attemptAt);
  assert.equal(next.quota.used_quota,40);
  assert.equal(next.quota.last_success_at,attemptAt);
  assert.equal(next.timelock.is_active,false);
  assert.equal(next.timelock.response_verified,false);
  assert.equal(next.timelock.stale,true);
  assert.equal(next.timelock.last_attempt_at,attemptAt);
  assert.equal(next.timelock.last_success_at,successAt);
  assert.equal(next.timelock.error,'provider_error');
  assert.equal(next.timelock.status_code,503);
  assert.equal(next.partial,true);
  assert.equal(next.available,true);
  assert.equal(next.response_verified,true);
});

test('a first failed read does not invent a prior success or expose unapproved fields',()=>{
  const snapshot=mergeAccountLimitsSnapshot({quota:{api_secret:'must not survive'}},{quota:{available:false,error:'provider_error'},timelock:{available:false,error:'read_timeout'}},attemptAt);
  assert.equal(snapshot.quota.available,false);
  assert.equal(snapshot.quota.last_success_at,null);
  assert.equal(snapshot.quota.api_secret,undefined);
  assert.equal(snapshot.available,false);
  assert.equal(snapshot.stale,false);
  assert.equal(snapshot.response_verified,false);
  assert.equal(snapshot.partial,true);
});

test('legacy verified subsection receives only its explicit parent observation time',()=>{
  const snapshot=mergeAccountLimitsSnapshot({observed_at:successAt,quota:{available:true,response_verified:true,total_quota:120,used_quota:35},timelock:{available:true,response_verified:false}}, {quota:{available:false,error:'read_timeout'},timelock},attemptAt);
  assert.equal(snapshot.quota.last_success_at,successAt);
  assert.equal(snapshot.quota.stale,true);
  assert.equal(snapshot.quota.total_quota,120);
  assert.equal(snapshot.timelock.last_success_at,attemptAt);
});
