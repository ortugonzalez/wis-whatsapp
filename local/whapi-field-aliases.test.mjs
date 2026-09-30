import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const aliases=await (async()=>{const context={window:{}};vm.runInNewContext(await readFile(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);return context.window.WIS_WHAPI_FIELD_ALIASES;})();

test('every reviewed method declares local source kinds',()=>{
  assert.ok(Object.keys(aliases).length>0);
  for(const [method,config] of Object.entries(aliases)){assert.ok(Array.isArray(config.source_kinds)&&config.source_kinds.length>0,`${method} needs scoped evidence`);}
});

test('every field mapping has a resource, path and explanation',()=>{
  for(const [method,config] of Object.entries(aliases))for(const [field,mappings] of Object.entries(config.fields||{}))for(const mapping of mappings){
    assert.equal(typeof mapping.field,'string');assert.ok(mapping.field.length>0);
    assert.equal(typeof mapping.note,'string');assert.ok(mapping.note.length>0);
  }
});

test('quota fields with unverified cycle semantics are explicitly non-equivalent',()=>{
  const config=aliases.getnewchatlimit;
  assert.deepEqual(Array.from(config.non_equivalent_fields),['updated_at','is_capped','cap_status','quota_remaining']);
  assert.match(config.fields.is_capped[0].note,/ciclo.*no está validada/);
  assert.match(config.fields.cap_status[0].note,/sin equivalencia WHAPI actual/);
  assert.match(config.fields.quota_remaining[0].note,/ciclo vencido/);
});

test('group aliases use known group metadata and leave unsupported message provenance explicit',()=>{
  assert.ok(aliases.getgroup.source_kinds.includes('group'));
  assert.ok(aliases.getgroup.source_kinds.includes('group_invite'));
  assert.equal(aliases.getgroup.fields.name[0].field,'subject');
  assert.equal(aliases.getgroup.fields.created_by[0].field,'owner');
  assert.equal(aliases.getgroups.fields['groups[].created_by'][0].field,'owner');
  assert.match(aliases.getgroup.fields.created_by[0].note,/group\.attrs\.creator/);
  assert.equal(aliases.getgroup.fields.invite_code[0].field,'code');
  assert.equal(aliases.getgroup.fields.invite_code[0].requires_non_empty_text,true);
  assert.match(aliases.getgroup.fields.invite_code[0].note,/TTL/);
  assert.ok(aliases.getgroup.non_equivalent_fields.includes('last_message.source'));
});

test('community methods accept only community-scoped evidence, never arbitrary groups',()=>{
  assert.deepEqual(Array.from(aliases.getcommunities.source_kinds),['communities','community']);
  assert.deepEqual(Array.from(aliases.getcommunity.source_kinds),['community','community_invite']);
  assert.equal(aliases.getcommunity.fields.invite_code[0].field,'code');
  assert.equal(aliases.getcommunity.fields.invite_code[0].requires_non_empty_text,true);
  assert.match(aliases.getcommunity.fields.invite_code[0].note,/TTL/);
  assert.deepEqual(Array.from(aliases.getcommunitysubgroups.source_kinds),['community','community_subgroups']);
  for(const method of ['getcommunities','getcommunity','getcommunitysubgroups'])assert.equal(aliases[method].source_kinds.includes('group'),false);
});

test('conversation and message aliases use stable local identifiers',()=>{
  assert.equal(aliases.getchat.fields.id[0].field,'id');
  assert.equal(aliases.getmessage.fields.id[0].field,'wa_message_id');
  assert.equal(aliases.getmessages.fields['messages[].id'][0].field,'wa_message_id');
});

test('contact aliases distinguish WhatsApp name fields and observed status',()=>{
  assert.equal(aliases.getcontacts.fields['contacts[].pushname'][0].field,'notify');
  assert.equal(aliases.getcontact.fields.status[0].field,'status.status');
});

test('profile aliases preserve separately observed business and public identity fields',()=>{
  assert.equal(aliases.getcontactprofile.fields.verified_name[0].field,'verifiedName');
  assert.equal(aliases.getuserprofile.fields.push_name[0].kind,'profile');
  assert.equal(aliases.getuserprofile.fields.push_name[0].field,'notify');
  assert.equal(aliases.getuserprofile.fields.verified_name[0].kind,'profile');
  assert.equal(aliases.getuserprofile.fields.verified_name[0].field,'verifiedName');
  assert.equal(aliases.getuserprofile.fields.verified_name[0].requires_non_empty_text,true);
  assert.equal(aliases.getuserprofile.fields.about[0].field,'items[].status.status');
  assert.ok(aliases.getusername.source_kinds.includes('account_username'));
  assert.deepEqual(Array.from(aliases.getcontactprofile.source_kinds),['contact']);
  assert.deepEqual(Array.from(aliases.getusername.source_kinds),['account_username']);
});

test('identity aliases do not infer mappings when only a metadata method is documented',()=>{
  assert.equal(aliases.getlidbyid.fields.lid[0].field,'lid');
  assert.equal(aliases.getidbylid.fields.id[0].field,'pn');
});

test('business profile aliases map only observed business fields',()=>{
  assert.equal(aliases.getbusinessprofile.fields.address[0].field,'address');
  assert.equal(aliases.getbusinessprofile.fields.email[0].field,'email');
  assert.equal(aliases.getbusinessprofile.fields.websites[0].field,'website[]');
  assert.equal(aliases.getbusinessprofile.fields['hours.timeZone'][0].field,'business_hours.timezone');
  assert.deepEqual(Array.from(aliases.getbusinessprofile.fields.hours,mapping=>[mapping.kind,mapping.field]),[
    ['business','business_hours'],['contact','business_profile.business_hours'],
  ]);
  assert.deepEqual(Array.from(aliases.getbusinessprofile.fields['hours.config'],mapping=>[mapping.kind,mapping.field]),[
    ['business','business_hours.config[]'],['contact','business_profile.business_hours.config[]'],
  ]);
});

test('newsletter and application aliases stay scoped to their own snapshots',()=>{
  assert.ok(aliases.getnewsletters.source_kinds.includes('newsletters'));
  assert.deepEqual(Array.from(aliases.getmessagesnewsletter.source_kinds),['newsletter_messages']);
  assert.equal(aliases.getmessagesnewsletter.fields['messages[].text.body'][0].field,'messages[].body');
  assert.equal(aliases.getmessagesnewsletter.fields['messages[].timestamp'][0].requires_non_empty_text,true);
  assert.equal(aliases.getgroupapplicationslist.fields['applications[].chatId'][0].field,'requests[].jid');
});

test('restriction aliases require a known local account-limits snapshot',()=>{
  assert.ok(aliases.getreachouttimelock.source_kinds.includes('account_limits'));
  assert.equal(aliases.getreachouttimelock.fields.is_restricted[0].field,'timelock.is_active');
  assert.match(aliases.getreachouttimelock.fields.is_restricted[0].note,/no equivale a suspensi/i);
});

test('metadata-only capability entries still declare an evidence scope',()=>{
  for(const method of ['getlabels','getlabelassociations','getblacklist','getcommunities','getbotlist','getcall'])assert.ok(aliases[method].source_kinds.length>0,method);
  assert.equal(aliases.getlabels.fields,undefined);
});

test('field aliases include clear explanations and bounded source paths',()=>{
  for(const [method,config] of Object.entries(aliases))for(const [field,mappings] of Object.entries(config.fields||{}))for(const mapping of mappings){
    assert.ok(mapping.field.length<=160,`${method}.${field} path is bounded`);
    assert.ok(mapping.note.length<=400,`${method}.${field} note is bounded`);
  }
});
