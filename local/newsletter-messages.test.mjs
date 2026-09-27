import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proto} from 'baileys';
import {checkedNewsletterMessages} from './worker.mjs';
test('newsletter read is a bounded get; missing replies never become verified empty',async()=>{
 await assert.rejects(checkedNewsletterMessages({query:async()=>undefined},'123@newsletter'),/read_timeout/);
 await assert.rejects(checkedNewsletterMessages({query:async()=>({tag:'iq',attrs:{type:'result'},content:[]})},'123@newsletter'),/invalid_newsletter_response/);
 await assert.rejects(checkedNewsletterMessages({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'message_updates',content:[]},{tag:'error',attrs:{code:'500'}}]})},'123@newsletter'),error=>error.message==='provider_error'&&error.statusCode===500);
 await assert.rejects(checkedNewsletterMessages({query:async()=>({tag:'iq',attrs:{type:'result'},content:'invalid'})},'123@newsletter'),/invalid_newsletter_response/);
 let reads=0;const result=await checkedNewsletterMessages({query:async(node,timeout)=>{reads++;assert.equal(node.attrs.type,'get');assert.equal(node.attrs.xmlns,'newsletter');assert.equal(node.content[0].tag,'message_updates');assert.equal(node.content[0].attrs.count,'50');assert.equal(timeout,10000);return {tag:'iq',attrs:{type:'result'},content:[{tag:'message_updates',content:[{tag:'message',attrs:{id:'message',t:'1700000000',token:'SECRET'},content:[{tag:'plaintext',content:Buffer.from(proto.Message.encode({conversation:'Observed text'}).finish())}]}]}]};}},'123@newsletter');
 assert.equal(reads,1);assert.equal(result.messages[0].body,'Observed text');assert.equal(result.complete,false);assert.equal(result.partial,true);assert.equal(JSON.stringify(result).includes('SECRET'),false);
 const empty=await checkedNewsletterMessages({query:async()=>({tag:'iq',attrs:{type:'result'},content:[{tag:'message_updates'}]})},'123@newsletter');assert.equal(empty.count,0);assert.equal(empty.complete,false);
});
