import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyWhatsAppChatType} from './wa-chat-type.mjs';

test('classifies only recognized WhatsApp chat namespaces',()=>{
  for(const [jid,type] of [
    ['group@g.us','group'],
    ['person@s.whatsapp.net','contact'],
    ['linked-device@lid','contact'],
    ['list@broadcast','broadcast'],
    ['status@broadcast','stories'],
    ['channel@newsletter','newsletter'],
  ]) assert.equal(classifyWhatsAppChatType(jid),type);
});

test('does not classify malformed, unknown, or oversized identities',()=>{
  for(const jid of [null,undefined,42,'','@g.us','missing-server@','too@many@parts@g.us','person@unknown','person@G.US','person @s.whatsapp.net','x'.repeat(257)+'@g.us']) assert.equal(classifyWhatsAppChatType(jid),null);
});
