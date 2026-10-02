import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {openDatabase} from './db.mjs';
import {normalizeGroupMemberTag,attachGroupMemberTags,observedGroupMemberTags} from './group-member-tags.mjs';
test('member tag accepts only explicit labels and identities without extra provider fields',()=>{
 const raw={groupId:'123@g.us',participant:'456@lid',label:'Moderador',messageTimestamp:10,secret:'SECRET'};
 const result=normalizeGroupMemberTag(raw,'now');assert.equal(result.label,'Moderador');assert.equal(result.participant_alt,null);assert.equal(result.secret,undefined);
 for(const label of ['',null,'a\n','a'.repeat(257)])assert.equal(normalizeGroupMemberTag({...raw,label}),null);
 for(const groupId of ['123@newsletter','123@g.us\n'])assert.equal(normalizeGroupMemberTag({...raw,groupId}),null);
 assert.equal(normalizeGroupMemberTag({...raw,participant:'456@lid\n'}),null);
 assert.equal(normalizeGroupMemberTag({...raw,messageTimestamp:NaN}).message_timestamp,null);
});
test('passive tags persist by group and participant with bounded, isolated reads',()=>{
 const db=openDatabase(':memory:'),ev=new EventEmitter();let owns=true;
 try{
 attachGroupMemberTags(ev,{guarded:fn=>x=>{if(owns)fn(x);},snapshot:(kind,id,data)=>db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(kind,id,JSON.stringify(data),'2026-01-01')});
 ev.emit('group.member-tag.update',{groupId:'123@g.us',participant:'456@lid',label:'Primera',participantAlt:'456@s.whatsapp.net'});
 ev.emit('group.member-tag.update',{groupId:'123@g.us',participant:'456@lid',label:'Segunda'});
 ev.emit('group.member-tag.update',{groupId:'789@g.us',participant:'456@lid',label:'Otro grupo'});
 const first=observedGroupMemberTags(db,'123@g.us');assert.equal(first.items.length,1);assert.equal(first.items[0].label,'Segunda');assert.equal(first.items[0].participant_alt,null);assert.equal(first.complete,false);
 owns=false;ev.emit('group.member-tag.update',{groupId:'123@g.us',participant:'456@lid',label:'Sin lease'});assert.equal(observedGroupMemberTags(db,'123@g.us').items[0].label,'Segunda');
 for(let i=0;i<501;i++)db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)').run('group_member_tag',`bulk/${i}`,JSON.stringify({group_id:'111@g.us',participant:`${i}@lid`,label:'x'}),'2026-01-01');
 assert.equal(observedGroupMemberTags(db,'111@g.us').items.length,500);assert.equal(observedGroupMemberTags(db,'111@g.us').truncated,true);
 }finally{db.close();}
});
