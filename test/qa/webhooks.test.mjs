import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliverWebhook,isPublicIPv4} from '../../local/webhooks.mjs';
test('QA: webhook blocks reserved networks and mixed DNS before any HTTP request',async()=>{
 for(const ip of ['0.0.0.1','100.64.0.1','127.1.2.3','169.254.1.2','172.31.0.1','192.0.2.1','192.88.99.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::ffff:127.0.0.1'])assert.equal(isPublicIPv4(ip),false,ip);
 let requests=0;
 await assert.rejects(deliverWebhook({url:'https://example.com',secret:'fake'},{event_id:'id',payload:'{"id":"id"}'},{allowedHosts:['example.com'],resolveDns:async()=>[{address:'8.8.8.8'},{address:'10.0.0.1'}],requestImpl:()=>{requests++;}}),/destination_not_public/);
 assert.equal(requests,0);
});
test('QA: disabling webhook during DNS resolution prevents dispatch',async()=>{
 let requests=0,active=true;
 await assert.rejects(deliverWebhook({url:'https://example.com',secret:'fake'},{event_id:'id',payload:'{"id":"id"}'},{allowedHosts:['example.com'],authorized:()=>active,resolveDns:async()=>{active=false;return [{address:'8.8.8.8'}];},requestImpl:()=>{requests++;}}),/dispatcher_stopped/);
 assert.equal(requests,0);
});
