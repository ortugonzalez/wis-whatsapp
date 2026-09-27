import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkedBotList} from './worker.mjs';
const response=bots=>({tag:'iq',attrs:{type:'result'},content:[{tag:'bot',content:[{tag:'section',attrs:{type:'all'},content:bots}]}]});
test('bot list validates read-only request, known container, safe fields and bounded results',async()=>{
 await assert.rejects(checkedBotList({query:async()=>undefined}),/read_timeout/);
 await assert.rejects(checkedBotList({query:async()=>({tag:'iq',attrs:{type:'result'},content:[]})}),/invalid_bot_response/);
 const bad=response([]);bad.content.push({tag:'error',attrs:{code:'403'}});await assert.rejects(checkedBotList({query:async()=>bad}),error=>error.statusCode===403);
 const result=await checkedBotList({query:async(node,timeout)=>{assert.equal(node.attrs.type,'get');assert.equal(node.attrs.xmlns,'bot');assert.equal(node.content[0].attrs.v,'2');assert.equal(timeout,10000);return response([{tag:'bot',attrs:{jid:'123@s.whatsapp.net',persona_id:'persona-1',token:'SECRET'}}]);}});assert.deepEqual(result.bots,[{jid:'123@s.whatsapp.net',persona_id:'persona-1'}]);assert.equal(result.complete,false);assert.equal(JSON.stringify(result).includes('SECRET'),false);
 assert.equal((await checkedBotList({query:async()=>response([])})).bots.length,0);
 const large=await checkedBotList({query:async()=>response(Array.from({length:1001},(_,i)=>({tag:'bot',attrs:{jid:i+'@bot'}})))});assert.equal(large.bots.length,1000);assert.equal(large.truncated,true);
 await assert.rejects(checkedBotList({query:async()=>response([{tag:'bot',attrs:{jid:'https://invalid'}}])}),/invalid_bot_response/);
});
