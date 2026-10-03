import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { summarizeContactAvatars } from './contact-avatar-coverage.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE contacts(wa_jid TEXT UNIQUE); CREATE TABLE snapshots(kind TEXT,resource_id TEXT,payload TEXT,updated_at TEXT,PRIMARY KEY(kind,resource_id));');
  const put = (id, data) => {
    db.prepare('INSERT INTO contacts VALUES(?)').run(id);
    if (data !== undefined) db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('avatar',id,JSON.stringify(data),'2026-10-03T00:00:00Z');
  };
  return {db,put};
}
test('contact avatar categories partition inspected targets and omit groups and private data',()=>{
  const {db,put}=fixture();
  try {
    put('1@lid'); put('2@lid',{filename:'missing',available:true,stale:false});
    put('3@lid',{filename:'cached',available:true,stale:false});
    put('4@s.whatsapp.net',{filename:'cached',available:true,stale:true});
    put('5@lid',{filename:'cached',available:false,stale:false});
    put('6@lid',[]); put('7@lid',{filename:'throws'});
    put('8@g.us',{filename:'cached',available:true,stale:false});
    const result=summarizeContactAvatars(db,{hasCachedFile:d=>{if(d.filename==='throws')throw Error('private path');return d.filename==='cached';}});
    assert.equal(result.total_targets,7); assert.equal(result.inspected_targets,7);
    for(const k of ['not_collected','no_cached_file','cached_current','cached_stale','cached_unavailable','invalid_snapshot','validation_errors'])assert.equal(result[k],1);
    assert.equal(result.partial,false);assert.equal(result.content_signature_verified,false);assert.equal(result.freshness_confirmed,false);
    assert.doesNotMatch(JSON.stringify(result),/@lid|whatsapp\.net|filename|private path|throws/);
  }finally{db.close();}
});
test('bounded sample does not claim complete inventory and malformed snapshot is isolated',()=>{
  const {db,put}=fixture();
  try {
    put('1@lid',{filename:'cached'});put('2@lid',{});put('3@lid');
    db.prepare("UPDATE snapshots SET payload='invalid',updated_at='invalid' WHERE resource_id='1@lid'").run();
    let calls=0;const result=summarizeContactAvatars(db,{limit:2,hasCachedFile:()=>{calls++;return false;}});
    assert.equal(result.total_targets,3);assert.equal(result.inspected_targets,2);assert.equal(result.partial,true);assert.equal(result.invalid_snapshot,1);assert.equal(calls,1);
    assert.equal(result.latest_sampled_snapshot_at,'2026-10-03T00:00:00.000Z');
    assert.throws(()=>summarizeContactAvatars(db,{limit:1001,hasCachedFile:()=>true}),/invalid_avatar_scan_limit/);
    assert.throws(()=>summarizeContactAvatars(db),/avatar_validator_required/);
  }finally{db.close();}
});
test('cached bytes without explicit successful current metadata do not count current',()=>{
  const {db,put}=fixture();
  try {
    put('1@lid',{available:true});put('2@lid',{available:'true',stale:false});
    const r=summarizeContactAvatars(db,{hasCachedFile:()=>true});
    assert.equal(r.cached_current,0);assert.equal(r.cached_unavailable,2);
  }finally{db.close();}
});
test('malformed and device targets do not consume sample or denominator',()=>{
  const {db,put}=fixture();
  try {
    for(const id of ['@lid','@s.whatsapp.net','0:1@s.whatsapp.net','0:1@lid','0a@lid',' 0@lid','0-1@s.whatsapp.net','0\n@lid','0@lid@lid','1@g.us','1@LID','1@S.WHATSAPP.NET'])put(id,{available:true,stale:false});
    put('9@lid',{available:true,stale:false});
    put('1'.repeat(151)+'@lid',{available:true,stale:false});
    const r=summarizeContactAvatars(db,{limit:1,hasCachedFile:()=>true});
    assert.equal(r.total_targets,1);assert.equal(r.inspected_targets,1);assert.equal(r.partial,false);assert.equal(r.cached_current,1);
  }finally{db.close();}
});
