import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNewsletterInviteInfoRpc,newsletterByInviteMetadata,validNewsletterInviteCode} from './newsletter-invite-info.mjs';

test('newsletter invite code lookup maps only verified safe WHAPI variables',()=>{
 assert.equal(validNewsletterInviteCode('Channel_123-x'),true);assert.equal(validNewsletterInviteCode('https://whatsapp.com/channel/Channel_123'),false);assert.equal(validNewsletterInviteCode('x'.repeat(129)),false);
 const result=newsletterByInviteMetadata({id:'12345@newsletter',name:'Canal',description:'Descripción',creation_time:1700000000,subscribers:42,verification:'VERIFIED',picture:{id:'photo',url:'signed-secret'},invite:'private-invite',owner:'private-owner',reaction_codes:[{code:'👍',count:3}]},'2026-01-02T00:00:00.000Z');
 assert.deepEqual(result.data,{id:'12345@newsletter',type:'newsletter',name:'Canal',description:'Descripción',subscribers_count:42,created_at:1700000000,verification:true});
 assert.deepEqual(result.meta.available_fields,{id:true,type:true,name:true,description:true,subscribers_count:true,created_at:true,verification:true});assert.equal(result.meta.has_picture,true);assert.equal(result.meta.response_verified,true);assert.equal(result.meta.partial,true);assert.equal(JSON.stringify(result).includes('signed-secret'),false);assert.equal(JSON.stringify(result).includes('private-invite'),false);assert.throws(()=>newsletterByInviteMetadata({id:'invalid',name:'No'}),{message:'invalid_newsletter_metadata_response'});
});

test('newsletter invite RPC keeps code transient and accepts only correlated worker responses',async()=>{
 const proc=new EventEmitter();proc.connected=true;proc.sent=[];proc.send=(message,callback)=>{proc.sent.push(message);callback?.(null);};const rpc=createNewsletterInviteInfoRpc({processRef:proc,timeoutMs:1000});
 try{const pending=rpc.lookup('OpaqueCode_123');const request=proc.sent[0];assert.equal(request.type,'wis.newsletter_invite_info.request');assert.equal(request.invite_code,'OpaqueCode_123');assert.equal(await rpc.lookup('AnotherCode').catch(error=>error.message),'previous_read_unresolved');proc.emit('message',{type:'wis.newsletter_invite_info.response',request_id:'00000000-0000-4000-8000-000000000000',result:{wrong:true}});const result={data:{id:'123@newsletter'},meta:{partial:true}};proc.emit('message',{type:'wis.newsletter_invite_info.response',request_id:request.request_id,result});assert.deepEqual(await pending,result);}
 finally{rpc.close();}
});

test('newsletter invite RPC rejects malformed codes and bounded read timeouts',async()=>{
 const proc=new EventEmitter();proc.connected=true;proc.send=()=>{};const rpc=createNewsletterInviteInfoRpc({processRef:proc,timeoutMs:5});
 try{assert.equal(await rpc.lookup('https://whatsapp.com/channel/x').catch(error=>error.message),'invalid_invite_code');assert.equal(await rpc.lookup('OpaqueCode').catch(error=>error.message),'read_timeout');proc.connected=false;assert.equal(await rpc.lookup('OpaqueCode').catch(error=>error.message),'connection_unavailable');}
 finally{rpc.close();}
});
