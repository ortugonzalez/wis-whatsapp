import test from 'node:test';
import assert from 'node:assert/strict';
import {isSessionActive,nextSessionExpiry,SESSION_ABSOLUTE_TTL_MS,SESSION_IDLE_TTL_MS,SESSION_REFRESH_MIN_EXTENSION_MS,shouldRefreshSession} from './session-policy.mjs';

test('administrator session refresh uses a 12-hour idle window and a seven-day hard cap',()=>{
 const now=Date.parse('2026-10-01T00:00:00.000Z'),createdAt=new Date(now-8*60*60_000).toISOString();
 const expiring={created_at:createdAt,expires_at:new Date(now+4*60*60_000).toISOString()};
 assert.equal(isSessionActive(expiring,now),true);
 assert.equal(shouldRefreshSession(expiring,now),true);
 assert.equal(SESSION_REFRESH_MIN_EXTENSION_MS,60_000);
 assert.equal(Date.parse(nextSessionExpiry(expiring,now)),now+SESSION_IDLE_TTL_MS);

 const active={created_at:new Date(now-5*60*60_000).toISOString(),expires_at:new Date(now+7*60*60_000).toISOString()};
 assert.equal(shouldRefreshSession(active,now),true);
 assert.equal(Date.parse(nextSessionExpiry(active,now)),now+SESSION_IDLE_TTL_MS);

 const capped={created_at:new Date(now-(SESSION_ABSOLUTE_TTL_MS-30*60_000)).toISOString(),expires_at:new Date(now+90*60_000).toISOString()};
 assert.equal(shouldRefreshSession(capped,now),false);
 assert.equal(Date.parse(nextSessionExpiry(capped,now)),now+30*60_000);
 assert.equal(isSessionActive(capped,now+30*60_000),false);
});

test('expired, malformed, or missing issuance timestamps cannot be renewed',()=>{
 const now=Date.parse('2026-10-01T00:00:00.000Z');
 for(const session of [null,{}, {created_at:'bad',expires_at:new Date(now+60_000).toISOString()}, {created_at:new Date(now-1).toISOString(),expires_at:new Date(now).toISOString()}, {created_at:new Date(now-SESSION_ABSOLUTE_TTL_MS).toISOString(),expires_at:new Date(now+60_000).toISOString()}]){
  assert.equal(isSessionActive(session,now),false);
  assert.equal(shouldRefreshSession(session,now),false);
  assert.equal(nextSessionExpiry(session,now),null);
 }
});
