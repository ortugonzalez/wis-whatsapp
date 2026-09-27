import test from 'node:test';
import assert from 'node:assert/strict';
import { sign,isPublicIPv4 } from './webhook-dispatcher.mjs';
test('rejects internal destinations',()=>{for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.2','169.254.169.254','172.16.0.1','100.64.0.1','::1'])assert.equal(isPublicIPv4(ip),false);assert.equal(isPublicIPv4('8.8.8.8'),true);});
test('signature binds timestamp and exact body',()=>{assert.equal(sign('secret','1','{}'),sign('secret','1','{}'));assert.notEqual(sign('secret','1','{}'),sign('secret','2','{}'));assert.notEqual(sign('secret','1','{}'),sign('secret','1','{ }'));});
