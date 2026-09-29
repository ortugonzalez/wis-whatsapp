import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectAccountLimits} from './account-limits-projection.mjs';

test('WHAPI limit projection preserves verified values and labels derived fields',()=>{
  const projection=projectAccountLimits({
    quota:{available:true,response_verified:true,total_quota:120,used_quota:35,cycle_start_timestamp:'1700000000',cycle_end_timestamp:'1700600000',server_sent_timestamp:'1700000001',capping_status:'FIRST_WARNING',ote_status:'ELIGIBLE',mv_status:'ACTIVE'},
    timelock:{available:true,response_verified:true,is_active:false,time_enforcement_ends:'1700000100',enforcement_type:'WEB_COMPANION_ONLY'},
  });
  assert.equal(projection.getnewchatlimit.verified,true);
  assert.deepEqual(projection.getnewchatlimit.fields,{cap_type:'individual_new_chat_thread',is_capped:null,cap_status:null,quota_limit:120,quota_used:35,quota_remaining:null,cycle_start_at:1700000000,cycle_end_at:1700600000,updated_at:null,ote_status:'eligible',mv_status:'active'});
  assert.match(projection.getnewchatlimit.field_sources.quota_remaining,/unmapped/);
  assert.deepEqual(projection.getnewchatlimit.unmapped_fields,['is_capped','cap_status','quota_remaining','updated_at']);
  assert.deepEqual(projection.getreachouttimelock.fields,{is_restricted:false,restricted_until:1700000100,restriction_type:'web_companion_only'});
});

test('expired or stale quota snapshots never claim current WHAPI cap fields',()=>{
  const expired=projectAccountLimits({observed_at:'2026-09-28T13:00:00.000Z',quota:{available:true,response_verified:true,total_quota:120,used_quota:120,capping_status:'CAPPED',cycle_end_timestamp:'1700600000'}}).getnewchatlimit;
  assert.equal(expired.verified,true);
  assert.equal(expired.currentness,'partial_cycle_validity_unverified');
  assert.equal(expired.fields.is_capped,null);
  assert.equal(expired.fields.cap_status,null);
  assert.equal(expired.fields.quota_remaining,null);

  const stale=projectAccountLimits({stale:true,quota:{available:true,response_verified:true,total_quota:120,used_quota:35,capping_status:'CAPPED'}}).getnewchatlimit;
  assert.equal(stale.verified,false);
  assert.equal(stale.currentness,'unavailable_or_stale');
  assert.ok(Object.values(stale.fields).every(value=>value===null));
});

test('stale timelock sections do not become verified restriction aliases',()=>{
  for(const stale of [{stale:true},{timelock:{available:true,response_verified:true,stale:true,is_active:true,time_enforcement_ends:'1700600000',enforcement_type:'DEFAULT'}}]){
    const projection=projectAccountLimits({...stale,timelock:{available:true,response_verified:true,is_active:true,time_enforcement_ends:'1700600000',enforcement_type:'DEFAULT',...stale.timelock}}).getreachouttimelock;
    assert.equal(projection.verified,false);
    assert.ok(Object.values(projection.fields).every(value=>value===null));
  }
});

test('projection leaves unavailable and inconsistent provider values unknown',()=>{
  const projection=projectAccountLimits({quota:{available:true,response_verified:false,total_quota:10,used_quota:4,capping_status:'CAPPED'},timelock:{available:false,is_active:false}});
  assert.equal(projection.getnewchatlimit.verified,false);
  assert.ok(Object.values(projection.getnewchatlimit.fields).every(value=>value===null));
  assert.equal(projection.getreachouttimelock.verified,false);
  assert.ok(Object.values(projection.getreachouttimelock.fields).every(value=>value===null));
  const inconsistent=projectAccountLimits({quota:{available:true,response_verified:true,total_quota:4,used_quota:10,capping_status:'UNKNOWN'}}).getnewchatlimit;
  assert.equal(inconsistent.fields.quota_remaining,null);
  assert.equal(inconsistent.fields.is_capped,null);
});
