import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkedBusinessRead,checkedListRead,classifyReadError} from '../../local/worker.mjs';

test('QA: missing provider responses cannot become empty business or list snapshots',async()=>{
 for(const method of ['getCatalog','getCollections','fetchBlocklist','groupFetchAllParticipating','communityFetchAllParticipating']) {
  const business=method.startsWith('get');
  const invoke=node=>business?checkedBusinessRead({query:async()=>node},method,method==='getCatalog'?[{jid:'123@s.whatsapp.net'}]:['123@s.whatsapp.net',100]):checkedListRead({query:async()=>node},method);
  await assert.rejects(()=>invoke(undefined),/read_timeout/);
  await assert.rejects(()=>invoke({tag:'iq',attrs:{type:'result'},content:[]}),/invalid_.*_response/);
  await assert.rejects(()=>invoke({tag:'iq',attrs:{type:'error'},content:[{tag:'error',attrs:{code:'403',text:'secret-provider-message'}}]}),error=>{
   assert.deepEqual(classifyReadError(error),{code:'access_denied',status_code:403});
   assert.ok(!error.message.includes('secret'));return true;
  });
 }
});

test('QA: real empty business containers parse only after validated IQ and bounded query',async()=>{
 for(const [method,tag] of [['getCatalog','product_catalog'],['getCollections','collections']]) {
  const socket={query:async(request,timeout)=>{
   assert.equal(timeout,30000);assert.equal(request.attrs.type,'get');
   assert.equal(request.content[0].tag,tag);
   return {tag:'iq',attrs:{type:'result'},content:[{tag,attrs:{},content:[]}]};
  }};
  const value=await checkedBusinessRead(socket,method,method==='getCatalog'?[{jid:'123@s.whatsapp.net'}]:['123@s.whatsapp.net',100]);
  assert.equal((method==='getCatalog'?value.products:value.collections).length,0);
 }
});
