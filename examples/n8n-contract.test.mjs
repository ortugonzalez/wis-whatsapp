import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign } from './webhook-dispatcher.mjs';
const workflow=JSON.parse(readFileSync(new URL('./n8n-receive-webhook.json',import.meta.url),'utf8'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const verify=new AsyncFunction('require','$input','$env','Buffer',workflow.nodes[1].parameters.jsCode);
const require=createRequire(import.meta.url);
test('inactive n8n receiver accepts original signed bytes and rejects altered or expired payload',async()=>{
  assert.equal(workflow.active,false);
  const secret='offline-test-only', timestamp=String(Math.floor(Date.now()/1000));
  const raw=JSON.stringify({id:'offline-event',type:'message.created',data:{}});
  const item={json:{body:raw,headers:{'x-wis-timestamp':timestamp,'x-wis-event-id':'offline-event','x-wis-signature':'sha256='+sign(secret,timestamp,raw)}}};
  const run=()=>verify.call({},require,{first:()=>item},{WIS_WEBHOOK_SECRET:secret},Buffer);
  assert.equal((await run())[0].json.verified,true);
  item.json.body=raw+' ';
  await assert.rejects(run(),/Firma/);
  item.json.body=raw;item.json.headers['x-wis-timestamp']='1';
  await assert.rejects(run(),/autorizado/);
});

test('inactive n8n receiver rejects signed malformed envelopes and excessive bodies',async()=>{
 const secret='offline-test-only',timestamp=String(Math.floor(Date.now()/1000));
 for(const value of [null,[],{id:'',type:'message.created',data:{}},{id:'offline-event',type:'',data:{}},{id:'offline-event',type:'message.created',data:[]},{id:'offline-event',type:'message.created',data:{body:'x'.repeat(1048577)}}]){
  const raw=JSON.stringify(value),item={json:{body:raw,headers:{'x-wis-timestamp':timestamp,'x-wis-event-id':'offline-event','x-wis-signature':'sha256='+sign(secret,timestamp,raw)}}};
  await assert.rejects(verify.call({},require,{first:()=>item},{WIS_WEBHOOK_SECRET:secret},Buffer));
 }
});

test('observations workflow is inactive manual read-only and contains no credentials',()=>{
 const text=readFileSync(new URL('./n8n-read-observations.json',import.meta.url),'utf8'),flow=JSON.parse(text);
 assert.equal(flow.active,false);
 const manual=flow.nodes.filter(n=>n.type==='n8n-nodes-base.manualTrigger');assert.equal(manual.length,1);
 assert.ok(flow.nodes.every(n=>['n8n-nodes-base.manualTrigger','n8n-nodes-base.httpRequest','n8n-nodes-base.stickyNote'].includes(n.type)));
 const reads=flow.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest');assert.equal(reads.length,3);
 assert.deepEqual(reads.map(n=>new URL(n.parameters.url).pathname).sort(),['/api/v1/calls','/api/v1/identities','/api/v1/stories']);
 for(const node of reads){const p=node.parameters,url=new URL(p.url);assert.equal(p.method,'GET');assert.deepEqual(p.options.redirect,{redirect:{followRedirects:false}});assert.equal(url.origin,'http://127.0.0.1:3010');assert.equal(url.searchParams.get('limit'),'50');assert.equal(url.searchParams.get('offset'),'0');assert.equal(p.authentication,'genericCredentialType');assert.equal(p.genericAuthType,'httpHeaderAuth');assert.match(node.name,/primera página parcial/);assert.equal(node.credentials,undefined);assert.equal(p.sendHeaders,undefined);assert.equal(p.headerParameters,undefined);assert.equal(p.sendBody,undefined);assert.equal(p.body,undefined);}
 assert.deepEqual(flow.connections[manual[0].name].main[0].map(n=>n.node).sort(),reads.map(n=>n.name).sort());
 const forbidden=new Set(['credentials','password','token','secret','headers','pinData','staticData']);
 function inspect(value){if(!value||typeof value!=='object')return;for(const [key,entry]of Object.entries(value)){assert.ok(!forbidden.has(key),'Unexpected embedded credential/state key: '+key);inspect(entry);}}inspect(flow);
 assert.equal(flow.settings.saveDataSuccessExecution,'none');assert.equal(flow.settings.saveDataErrorExecution,'none');assert.equal(flow.settings.saveManualExecutions,false);
 assert.match(text,/meta.has_more/);assert.match(text,/NO recorre páginas/);
});
