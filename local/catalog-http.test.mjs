import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicCatalogReader,discoverPublicCatalogConfig,extractPublicCatalogConfig} from './catalog-http.mjs';
const config={token:'WA|FAKE_TEST_ONLY',catalog:'30445081048424116',collections:'9430970660362540'};
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('discovery resolves only named exported variable; never evaluates JS or chooses WWW credential',async()=>{
 const script='__d("WAWebGraphQLConstants",[],function(){var a="WA|WRONG_WWW",g="WA|FAKE_TEST_ONLY";l.WHATSAPP_GRAPHQL_CATALOG_ACCESS_TOKEN=g;globalThis.evil=true;});__d("Other",[],function(){});';
 assert.equal(extractPublicCatalogConfig(script).token,config.token);assert.equal(globalThis.evil,undefined);
 const calls=[];
 const found=await discoverPublicCatalogConfig({fetchImpl:async(url,options)=>{
  calls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  return new Response(url.includes('web.whatsapp.com')?'<script src="https://evil.test/a.js"></script><script src="https://static.whatsapp.net/a.js"></script>':script);
 }});
 assert.equal(found.token,config.token);assert.equal(calls.length,2);assert.ok(calls.every(x=>!x.includes('evil.test')));
});
test('own public catalog validates exact arrays and strips unknown or secret-bearing fields',async()=>{
 const requests=[];const reader=createPublicCatalogReader({ownJid:'5491111115679:1@s.whatsapp.net',discover:async()=>config,fetchImpl:async(url,options)=>{
  requests.push({url,options});const body=JSON.parse(options.body);
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(body.access_token,config.token);
  assert.equal(body.variables.request.product_catalog.jid,'5491111115679@s.whatsapp.net');assert.equal(body.variables.request.product_catalog.limit,'50');
  return json({data:{xwa_product_catalog_get_product_catalog:{product_catalog:{products:[{id:'p',name:'Public product',price:'100',currency:'ARS',mediaKey:'SECRET',access_token:'SECRET',image_url:'SIGNED_SECRET'}],paging:{cursors:{after:'next'}}}}}});
 }});
 const result=await reader.catalog();assert.equal(result.products[0].name,'Public product');assert.equal(result.scope,'public_catalog');assert.equal(result.paging.after,'next');assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.equal(requests.length,1);
 assert.throws(()=>createPublicCatalogReader({ownJid:'5679'}),/invalid_own_jid/);
});
test('collections valid empty result differs from malformed/no response and auth has no retries',async()=>{
 for(const [body,success] of [[{data:{xwa_product_catalog_get_collections:{collections:[],paging:{}}}},true],[{data:{xwa_product_catalog_get_collections:{}}},false],[{},false]]) {
  const reader=createPublicCatalogReader({ownJid:'5491111115679@s.whatsapp.net',discover:async()=>config,fetchImpl:async()=>json(body)});
  if(success)assert.deepEqual((await reader.collections()).collections,[]);else await assert.rejects(reader.collections(),/invalid_catalog_response/);
 }
 let calls=0;const reader=createPublicCatalogReader({ownJid:'5491111115679@s.whatsapp.net',discover:async()=>config,fetchImpl:async()=>{calls++;return new Response('SECRET error response',{status:403});}});
 await assert.rejects(reader.catalog(),e=>e.code==='access_denied' && !e.message.includes('SECRET'));assert.equal(calls,1);
});
test('HTTP output bounds, malformed JSON and GraphQL errors remain sanitized',async()=>{
 for(const response of [new Response('notjson SECRET'),json({errors:[{message:'SECRET'}]}),new Response('SECRET',{headers:{'content-length':String(5*1024*1024)}})]) {
  const reader=createPublicCatalogReader({ownJid:'5491111115679@s.whatsapp.net',discover:async()=>config,fetchImpl:async()=>response});
  await assert.rejects(reader.catalog(),e=>!e.message.includes('SECRET'));
 }
});
