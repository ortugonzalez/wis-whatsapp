import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDisappearingModeReply,isKnownChatJid} from './disappearing-mode.mjs';

test('normalizes only one exact known-chat reply without converting duration units',()=>{
 const observed='2026-09-28T12:00:00.000Z';
 assert.deepEqual(normalizeDisappearingModeReply([{id:'123@s.whatsapp.net',disappearing_mode:{duration:86400,setAt:new Date('2026-09-27T00:00:00Z')}}],'123@s.whatsapp.net',observed),{available:true,response_verified:true,stale:false,scope:'known_chat',duration_seconds:86400,set_at:'2026-09-27T00:00:00.000Z',observed_at:observed});
 assert.equal(normalizeDisappearingModeReply([{id:'123@g.us',disappearing_mode:{duration:0,setAt:new Date(0)}}],'123@g.us',observed).set_at,null);
});

test('refuses arbitrary targets, unmatched replies, duplicates, and absent mode values',()=>{
 assert.equal(isKnownChatJid('123-4@g.us'),true);assert.equal(isKnownChatJid('123@newsletter'),false);
 assert.throws(()=>normalizeDisappearingModeReply([], '123@s.whatsapp.net'),{message:'no_exact_disappearing_mode_reply'});
 assert.throws(()=>normalizeDisappearingModeReply([{id:'123@s.whatsapp.net'},{id:'123@s.whatsapp.net'}], '123@s.whatsapp.net'),{message:'no_exact_disappearing_mode_reply'});
 assert.throws(()=>normalizeDisappearingModeReply([{id:'123@s.whatsapp.net',disappearing_mode:{duration:-1}}], '123@s.whatsapp.net'),{message:'disappearing_mode_not_returned'});
 assert.throws(()=>normalizeDisappearingModeReply([{id:'123@newsletter',disappearing_mode:{duration:60}}], '123@newsletter'),{message:'invalid_disappearing_mode_response'});
});
