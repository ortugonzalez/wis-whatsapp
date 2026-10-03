import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {parseBusinessMinute,projectBusinessHourMinutes,buildBusinessMinuteCoverage} from './business-hour-minutes.mjs';
test('minutes conversion preserves zero and accepts only conservative decimal minute values',()=>{
 for(const [v,want] of [[0,0],['0',0],['0540',540],[960,960],['1439',1439]])assert.equal(parseBusinessMinute(v),want);
 for(const v of ['',null,undefined,true,[],{},' 540','540 ','09:00','5e2','540.0','-1',-1,Infinity,NaN,1.5,1440,'1441'])assert.equal(parseBusinessMinute(v),null);
 assert.equal(parseBusinessMinute('1440',{closing:true}),1440);assert.equal(parseBusinessMinute('1441',{closing:true}),null);
});
test('projection keeps row alignment without modifying raw attributes or exposing unrelated values',()=>{
 const raw={business_hours:{config:[{open_time:'0',close_time:'1440',secret:'private'},null,{open_time:'09:00',close_time:'960'}]}};
 const before=JSON.stringify(raw),result=projectBusinessHourMinutes(raw);
 assert.deepEqual(result,{rows:[{openTime:0,closeTime:1440},{},{closeTime:960}],truncated:false});
 assert.equal(JSON.stringify(raw),before);assert.doesNotMatch(JSON.stringify(result),/secret|private/);
 assert.equal(projectBusinessHourMinutes({business_hours:{config:Array(29).fill({open_time:'0'})}}).rows.length,28);
 assert.equal(projectBusinessHourMinutes({business_hours:{config:Array(29).fill({})}}).truncated,true);
});
test('coverage is own-account only and retains stale classification without returning minutes',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT)');
 try{
  const payload={available:true,stale:false,business_hours:{config:[{open_time:'540',close_time:'960'}]}};
  const put=(id,data)=>db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('business',id,JSON.stringify(data),'2026-10-03T00:00:00Z');
  put('other',payload);assert.equal(buildBusinessMinuteCoverage(db).records,0);
  put('wis-5679',payload);let r=buildBusinessMinuteCoverage(db);assert.equal(r.field_counts.length,3);assert.equal(r.field_counts[0].stale_records,0);assert.doesNotMatch(JSON.stringify(r),/540|960|wis-5679/);
  const update=p=>db.prepare("UPDATE snapshots SET payload=? WHERE resource_id='wis-5679'").run(JSON.stringify(p));
  update({...payload,available:false,stale:true});assert.equal(buildBusinessMinuteCoverage(db).records,0);
  update({...payload,available:false,stale:true,last_success_at:'2026-10-02T00:00:00Z'});r=buildBusinessMinuteCoverage(db);assert.equal(r.field_counts[0].stale_records,1);
  update({...payload,business_hours:{config:[{open_time:'bad',close_time:''}]}});assert.equal(buildBusinessMinuteCoverage(db).field_counts.length,1);
  update({...payload,business_hours:{config:[...Array(28).fill({}),{open_time:'540'}]}});r=buildBusinessMinuteCoverage(db);assert.equal(r.truncated,true);assert.equal(r.row_limit,28);assert.equal(r.field_counts.length,1);
 }finally{db.close();}
});
