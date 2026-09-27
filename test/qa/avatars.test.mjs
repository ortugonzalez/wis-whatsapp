import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cacheAvatar} from '../../local/avatars.mjs';
test('QA: avatar DNS mix and authorization loss prevent any HTTP request',async()=>{
 let calls=0;
 for(const addresses of [[{address:'8.8.8.8'},{address:'192.168.1.1'}],[{address:'8.8.8.8'}]]){
  await assert.rejects(cacheAvatar('https://mmg.whatsapp.net/a?token=FAKE',{resolveDns:async()=>addresses,authorized:()=>false,requestImpl:()=>{calls++;}}),/avatar_destination_rejected/);
 }
 assert.equal(calls,0);
});
test('QA: avatar URL rejects lookalike domains, user info, fragments and unexpected ports',async()=>{
 for(const url of ['https://mmg.whatsapp.net.evil.test/a','https://evil@mmg.whatsapp.net/a','https://mmg.whatsapp.net/a#fragment','https://mmg.whatsapp.net:444/a','http://mmg.whatsapp.net/a']){
  await assert.rejects(cacheAvatar(url,{resolveDns:()=>{throw Error('DNS must not execute');}}),/avatar_destination_rejected/);
 }
});
