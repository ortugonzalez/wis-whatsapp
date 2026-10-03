import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {attachReceiveActivity} from './receive-activity.mjs';
test('passive receive activity separates notify and append, ignores history/echoes, and excludes private payloads',()=>{
 const ev=new EventEmitter(),rows=[];let owns=true,clock='2026-10-02T00:00:00Z';attachReceiveActivity(ev,{guarded:fn=>v=>{if(owns)fn(v);},snapshot:(...v)=>{if(v[0]==='receive_activity')rows.push(v);},now:()=>clock});
 const incoming={key:{fromMe:false,remoteJid:'fixture@s.whatsapp.net',id:'private-fixture'},message:{conversation:'private-content'},messageTimestamp:1};
 ev.emit('messaging-history.set',{messages:[incoming]});ev.emit('messages.upsert',{type:'notify',messages:[{...incoming,key:{...incoming.key,fromMe:true}}]});ev.emit('messages.upsert',{messages:[incoming]});ev.emit('messages.upsert',{type:'notify',messages:[{key:{fromMe:false}}]});assert.equal(rows.length,0);
 ev.emit('messages.upsert',{type:'append',messages:[incoming]});ev.emit('messages.upsert',{type:'notify',messages:[incoming]});assert.deepEqual(rows.map(r=>r[1]),['inbound_append','inbound_notify']);assert.equal(rows[1][2].observed_at,clock);assert.equal(rows[1][2].inbound_envelopes,1);assert.equal(rows[1][2].unique_messages,false);assert.equal(rows[1][2].persistence_confirmed,false);assert.ok(!JSON.stringify(rows).includes('private'));assert.ok(!JSON.stringify(rows).includes('fixture@s'));
 clock='2026-10-02T00:01:00Z';ev.emit('messages.upsert',{type:'notify',messages:[incoming]});assert.equal(rows[2][2].observed_at,clock);owns=false;ev.emit('messages.upsert',{type:'notify',messages:[incoming]});assert.equal(rows.length,3);
});

test('upsert diagnostics distinguish echo, absent content and unknown direction without identifiers',()=>{
 const ev=new EventEmitter(),rows=[];let owns=true;
 attachReceiveActivity(ev,{guarded:fn=>v=>{if(owns)fn(v);},snapshot:(...v)=>rows.push(v),now:()=> '2026-10-03T00:00:00Z'});
 ev.emit('messages.upsert',{type:'private-value',messages:[{key:{fromMe:true,id:'private-id'},message:{conversation:'private-content'}},{key:{fromMe:false}},null]});
 assert.equal(rows.length,1);const [kind,id,data]=rows[0];assert.equal(kind,'message_activity');assert.equal(id,'last_upsert');assert.equal(data.upsert_type,'other');assert.equal(data.envelopes,3);assert.equal(data.inbound,1);assert.equal(data.outbound,1);assert.equal(data.unknown_direction,1);assert.equal(data.without_content,2);assert.equal(data.persistence_confirmed,false);assert.equal(data.unique_messages,false);assert.doesNotMatch(JSON.stringify(rows),/private/);
 ev.emit('messaging-history.set',{messages:[{}]});ev.emit('messages.upsert',{messages:null});assert.equal(rows.length,1);
 owns=false;ev.emit('messages.upsert',{type:'notify',messages:[]});assert.equal(rows.length,1);
});
