import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkedBotList} from './worker.mjs';

test('bot list uses the verified Baileys wire contract, distinguishes empty from missing data and bounds safe identities',async()=>{
 const response=bots=>({tag:'iq',attrs:{type:'result'},content:[{tag:'bot',attrs:{},content:[{tag:'section',attrs:{type:'all'},content:bots.map(({jid,persona_id})=>({tag:'bot',attrs:{jid,...(persona_id?{persona_id}:{})}}))}]}]});
 let request,timeout;
 const result=await checkedBotList({query:async(node,ms)=>{request=node;timeout=ms;return response([{jid:'123@s.whatsapp.net',persona_id:'helpful_bot'},{jid:'456@lid'}]);}});
 assert.deepEqual(result,{bots:[{jid:'123@s.whatsapp.net',persona_id:'helpful_bot'},{jid:'456@lid',persona_id:null}],truncated:false,response_verified:true,partial:true,complete:false,limit:1000});
 assert.deepEqual(request,{tag:'iq',attrs:{xmlns:'bot',to:'s.whatsapp.net',type:'get'},content:[{tag:'bot',attrs:{v:'2'}}]});assert.equal(timeout,10000);
 const empty=await checkedBotList({query:async()=>response([])});assert.deepEqual(empty.bots,[]);assert.equal(empty.response_verified,true);
 await assert.rejects(checkedBotList({query:async()=>({tag:'iq',attrs:{type:'result'},content:[]})}),/invalid_bot_response/);
 await assert.rejects(checkedBotList({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'bot',content:[]}]})}),/invalid_bot_response/);
 await assert.rejects(checkedBotList({query:async()=>response([{jid:'not-an-identity'}])}),/invalid_bot_response/);
 await assert.rejects(checkedBotList({query:async()=>response([{jid:'123@bot',persona_id:'bad value'}])}),/invalid_bot_response/);
 const large=await checkedBotList({query:async()=>response(Array.from({length:1001},(_,index)=>({jid:`${index+1}@bot`,persona_id:'bot'})))});
 assert.equal(large.bots.length,1000);assert.equal(large.truncated,true);
 await assert.rejects(checkedBotList({query:async()=>({tag:'iq',attrs:{type:'error'},content:[{tag:'error',attrs:{code:'500'}}]})}),error=>error.message==='provider_error'&&error.statusCode===500);
 await assert.rejects(checkedBotList({query:async()=>undefined}),/read_timeout/);
 await assert.rejects(checkedBotList({}),/capability_unavailable/);
});
