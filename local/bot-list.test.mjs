import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkedBotList} from './worker.mjs';

test('bot list uses the Baileys getter, rejects unverified emptiness and bounds safe identities',async()=>{
 let reads=0,rawQueries=0;
 const result=await checkedBotList({getBotListV2:async()=>{reads++;return [{jid:'123@s.whatsapp.net',personaId:'helpful_bot'},{jid:'456@lid'}];},query:async()=>{rawQueries++;throw Error('unexpected raw query');}});
 assert.deepEqual(result,{bots:[{jid:'123@s.whatsapp.net',persona_id:'helpful_bot'},{jid:'456@lid',persona_id:null}],truncated:false,partial:true,complete:false,limit:1000});
 assert.equal(reads,1);assert.equal(rawQueries,0);
 await assert.rejects(checkedBotList({getBotListV2:async()=>[]}),/invalid_bot_response/);
 await assert.rejects(checkedBotList({getBotListV2:async()=>[{jid:'not-an-identity'}]}),/invalid_bot_response/);
 await assert.rejects(checkedBotList({getBotListV2:async()=>[{jid:'123@bot',personaId:'bad value'}]}),/invalid_bot_response/);
 const large=await checkedBotList({getBotListV2:async()=>Array.from({length:1001},(_,index)=>({jid:`${index+1}@bot`,personaId:'bot'}))});
 assert.equal(large.bots.length,1000);assert.equal(large.truncated,true);
 await assert.rejects(checkedBotList({}),/capability_unavailable/);
});
