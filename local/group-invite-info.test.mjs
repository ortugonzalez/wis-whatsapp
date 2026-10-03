import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createGroupInviteInfoRpc,groupMetadataByInviteCode,validGroupInviteCode} from './group-invite-info.mjs';

test('participant roles require explicit provider values and report partial projection',()=>{
 const participants=[{id:'1@lid',admin:null},{id:'2@lid',admin:'admin'},{id:'3@lid',admin:'superadmin'},...['missing',undefined,'owner','',false,0,{}].map((admin,index)=>admin==='missing'?{id:`${index+4}@lid`}:{id:`${index+4}@lid`,admin}),{id:'invalid',admin:null}];
 const result=groupMetadataByInviteCode({id:'123@g.us',participants});
 assert.deepEqual(result.data.participants.slice(0,3).map(p=>p.rank),['member','admin','creator']);
 assert.ok(result.data.participants.slice(3).every(p=>!Object.hasOwn(p,'rank')));
 assert.equal(result.meta.participants_unknown_rank,7);
 assert.equal(result.meta.participants_rejected,1);
 assert.equal(result.meta.participants_projection_complete,false);
 assert.equal(result.data.participantsCount,11); // provider list size, not count of accepted rows
 const clean=groupMetadataByInviteCode({id:'123@g.us',participants:participants.slice(0,3)});
 assert.equal(clean.meta.participants_projection_complete,true);
 const absent=groupMetadataByInviteCode({id:'123@g.us'});
 assert.equal(absent.meta.participants_projection_complete,false);
 assert.equal(Object.hasOwn(absent.data,'participants'),false);
 const bounded=groupMetadataByInviteCode({id:'123@g.us',participants:Array.from({length:4097},()=>({id:'1@lid',admin:null}))});
 assert.equal(bounded.data.participants.length,4096);
 assert.equal(bounded.meta.participants_projection_complete,false);
 assert.equal(bounded.meta.participants_truncated,true);
});

test('invite codes are bounded opaque input and Baileys metadata maps to WHAPI fields',()=>{
 assert.equal(validGroupInviteCode('Abc_123-'),true);assert.equal(validGroupInviteCode('https://chat.whatsapp.com/Abc123'),false);assert.equal(validGroupInviteCode('x'.repeat(129)),false);
 const result=groupMetadataByInviteCode({id:'12345@g.us',subject:'Equipo',subjectTime:1700000000,creation:1600000000,owner:'123@s.whatsapp.net',size:3,ephemeralDuration:86400,participants:[{id:'123@s.whatsapp.net',admin:'superadmin'},{id:'456@s.whatsapp.net',admin:'admin'},{id:'789@lid',admin:null}]},'2026-01-02T00:00:00.000Z');
 assert.deepEqual(result.data,{id:'12345@g.us',name_at:1700000000,name:'Equipo',participants:[{id:'123@s.whatsapp.net',rank:'creator'},{id:'456@s.whatsapp.net',rank:'admin'},{id:'789@lid',rank:'member'}],participantsCount:3,created_at:1600000000,created_by:'123@s.whatsapp.net',ephemeral:86400});
 const item=JSON.parse(readFileSync(new URL('../public/whapi-fields.json',import.meta.url),'utf8')).methods.find(method=>method.id==='getgroupmetadatabyinvitecode');
 const reference=item?.operations.find(operation=>operation.operation_id==='getGroupMetadataByInviteCode');assert.ok(reference);
 const expected=[...new Set(reference.response_fields['200'].map(field=>field.path.split('.')[0].replace(/\[\]$/,'')))].sort();assert.deepEqual(Object.keys(result.data).sort(),expected);
 assert.equal(result.meta.response_verified,true);assert.equal(result.meta.available_fields.id,true);assert.equal(result.meta.available_fields.ephemeral,true);assert.throws(()=>groupMetadataByInviteCode({id:'bad',subject:'x'}),{message:'invalid_group_metadata_response'});
});

test('invite lookup RPC keeps input in memory and accepts only correlated responses',async()=>{
 const proc=new EventEmitter();proc.connected=true;proc.sent=[];proc.send=(message,callback)=>{proc.sent.push(message);callback?.(null);};
 const rpc=createGroupInviteInfoRpc({processRef:proc,timeoutMs:1000});
 try{const pending=rpc.lookup('OpaqueInviteCode');const request=proc.sent[0];assert.equal(request.type,'wis.group_invite_info.request');assert.equal(request.invite_code,'OpaqueInviteCode');assert.equal(request.request_id.length,36);assert.equal(await rpc.lookup('SecondCode').catch(error=>error.message),'previous_read_unresolved');
  proc.emit('message',{type:'wis.group_invite_info.response',request_id:'00000000-0000-4000-8000-000000000000',result:{wrong:true}});
  const result={data:{id:'12345@g.us'},meta:{response_verified:true}};proc.emit('message',{type:'wis.group_invite_info.response',request_id:request.request_id,result});assert.deepEqual(await pending,result);
 }finally{rpc.close();}
});

test('invite lookup RPC rejects timeouts and disconnects without leaking provider data',async()=>{
 const proc=new EventEmitter();proc.connected=true;proc.send=()=>{};const rpc=createGroupInviteInfoRpc({processRef:proc,timeoutMs:5});
 try{assert.equal(await rpc.lookup('OpaqueInviteCode').catch(error=>error.message),'read_timeout');proc.connected=false;assert.equal(await rpc.lookup('OpaqueInviteCode').catch(error=>error.message),'connection_unavailable');}
 finally{rpc.close();}
});
