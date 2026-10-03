import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

const aliases=await (async()=>{const context={window:{}};vm.runInNewContext(await readFile(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),context);return context.window.WIS_WHAPI_FIELD_ALIASES;})();

test('passive settings, member labels and reaction notifications do not imply unrelated WHAPI response coverage',()=>{
 const definitions=[['getchannelsettings',['locale']],['getgroup',['participants[].rank']],['getmessagesnewsletter',['messages[].reactions[].count','messages[].reactions[].unread']]];
 const reference={methods:definitions.map(([id,paths])=>({id,operations:[{response_fields:{200:paths.map(path=>({path}))}}]}))};
 // Even identical names in an unrelated observation must not create coverage.
 const coverage={snapshot_kinds:[
  {kind:'account_setting',field_counts:[{field:'locale',records:1},{field:'value',records:1}]},
  {kind:'group_member_tag',field_counts:[{field:'label',records:1},{field:'participants[0].rank',records:1}]},
  {kind:'newsletter_reaction',field_counts:[{field:'reported_event_count',records:1},{field:'messages[0].reactions[0].count',records:1},{field:'messages[0].reactions[0].unread',records:1}]},
 ]};
 const report=summarizeCapabilityFieldCoverage(reference,coverage,aliases);
 assert.equal(report.totals.exact_response_fields_observed,0);
 assert.equal(report.totals.semantic_response_fields_observed,0);
 assert.equal(report.totals.response_fields_without_observation,4);
});

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
  assert.equal(aliases.getgroup.fields.mute[0].field,'whapi_derived.group_mute_from_mute_end_time');
  assert.equal(aliases.getgroups.fields['groups[].mute'][0].field,'whapi_derived.group_mute_from_mute_end_time');
  assert.match(aliases.getgroups.fields['groups[].mute'][0].note,/filtrado a JID grupales/);
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
  assert.equal(aliases.getchat.fields.type[0].field,'whapi_derived.chat_type_from_jid');
  assert.equal(aliases.getchats.fields['chats[].type'][0].field,'whapi_derived.chat_type_from_jid');
  assert.match(aliases.getchat.fields.type[0].note,/derivado.*no es un campo leído/i);
  assert.equal(aliases.getmessage.fields.id[0].field,'wa_message_id');
  assert.equal(aliases.getmessages.fields['messages[].id'][0].field,'wa_message_id');
});

test('media response aliases use type-scoped Baileys metadata and safe message paths',()=>{
  const textFields=['audio.mime_type','document.mime_type','document.file_name','document.filename','document.caption','image.mime_type','image.file_name','image.caption','location.name','location.address','video.mime_type','video.file_name','video.caption'];
  for(const [method,prefix] of [['getmessage',''],['getmessages','messages[].'],['getmessagesbychatid','messages[].']]){
    assert.equal(aliases[method].fields[`${prefix}image.mime_type`][0].kind,'message_image');
    assert.equal(aliases[method].fields[`${prefix}video.seconds`][0].field,'details.seconds');
    assert.equal(aliases[method].fields[`${prefix}location.latitude`][0].field,'details.degreesLatitude');
    assert.equal(aliases[method].fields[`${prefix}document.caption`][0].requires_non_empty_text,true);
    for(const field of textFields)assert.equal(aliases[method].fields[`${prefix}${field}`][0].requires_non_empty_text,true,`${method}.${field} must reject empty text`);
  }
  assert.match(aliases.getmessage.fields['image.mime_type'][0].note,/solo en im[aá]genes/);
});

test('chat and group mention and spam aliases use scoped Baileys evidence',()=>{
  assert.equal(aliases.getchat.fields.unread_mention[0].field,'whapi_derived.all_unread_mention_from_unread_mention_count');
  assert.equal(aliases.getchats.fields['chats[].unread_mention'][0].field,'whapi_derived.all_unread_mention_from_unread_mention_count');
  assert.equal(aliases.getgroup.fields.unread_mention[0].field,'whapi_derived.group_unread_mention_from_unread_mention_count');
  assert.equal(aliases.getgroups.fields['groups[].unread_mention'][0].field,'whapi_derived.group_unread_mention_from_unread_mention_count');
  for(const [method,field] of [['getchat','not_spam'],['getchats','chats[].not_spam']])assert.equal(aliases[method].fields[field][0].field,'notSpam');
  for(const [method,field] of [['getgroup','not_spam'],['getgroups','groups[].not_spam']])assert.equal(aliases[method].fields[field][0].field,'whapi_derived.group_not_spam_from_not_spam');
  assert.match(aliases.getchats.fields['chats[].unread_mention'][0].note,/unreadMentionCount.*mayor que cero/);
  assert.match(aliases.getgroups.fields['groups[].unread_mention'][0].note,/alcance limitado a grupos/);
});

test('group metadata aliases use aggregate fields scoped to known groups',()=>{
  const groupFields=['pin','mute_until','archive','unread','read_only'];
  for(const [method,fields] of [['getgroup',Object.fromEntries(groupFields.map(field=>[field,field]))],['getgroups',Object.fromEntries(groupFields.map(field=>[`groups[].${field}`,field]))]])for(const [alias,field] of Object.entries(fields)){assert.equal(aliases[method].fields[alias][0].field,`whapi_derived.group_${field}_from_chat`);assert.match(aliases[method].fields[alias][0].note,/grupos?( conocidos)?|chats grupales conocidos/);}
  assert.equal(aliases.getgroups.fields['groups[].timestamp'][0].field,'whapi_derived.group_timestamp_from_chat');
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

test('contact profile image fields stay uncovered when the local protected thumbnail differs from WHAPI URLs',()=>{
  assert.deepEqual(Array.from(aliases.getcontactprofile.non_equivalent_fields),['icon','icon_full']);
  assert.match(aliases.getcontactprofile.non_equivalent_notes.icon,/WIS cachea como archivo privado/);
  assert.match(aliases.getcontactprofile.non_equivalent_notes.icon_full,/solo la miniatura preview/);
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
    ['business','business_hours'],
  ]);
  assert.deepEqual(Array.from(aliases.getbusinessprofile.fields['hours.config'],mapping=>[mapping.kind,mapping.field]),[
    ['business','business_hours.config[]'],
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
  assert.deepEqual(Object.keys(aliases.getlabels.fields).sort(),['[].id','[].name']);
});

test('label association evidence is limited to active chat-level Baileys events',()=>{
  assert.deepEqual(Array.from(aliases.getlabelassociations.source_kinds),['label_chat_association']);
  assert.equal(aliases.getlabelassociations.fields['chats[].id'][0].field,'chatId');
  assert.match(aliases.getlabelassociations.fields['chats[].id'][0].note,/no recupera asociaciones históricas.*consulta completa de WHAPI/);
});

test('label association explorer is visible from Labels and describes partial event coverage',async()=>{
  const explorer=await readFile(new URL('./public/explorer.js',import.meta.url),'utf8');
  assert.match(explorer,/page==='labels'\?\['labels','label-associations'\]/);
  assert.match(explorer,/endpoint:'label-associations'/);
  assert.match(explorer,/no cuenta con un getter p.blico para pedir un inventario hist.rico completo/i);
  assert.match(explorer,/eventos que recibi. la sesi.n, incluidos los que WhatsApp pudiera sincronizar/i);
  assert.match(explorer,/una lista vac.a no demuestra que no existan asociaciones/i);
  assert.match(explorer,/Asociación activa de etiqueta/);
  assert.match(explorer,/No hay asociaciones activas de .*coincidentes; el inventario puede ser parcial/);
  assert.doesNotMatch(explorer,/current==='label-associations'\?[^:]*'Se observó una respuesta vacía/);
  assert.match(explorer,/current==='label-associations'\?'Sin asociaciones activas coincidentes'/);
});

test('field aliases include clear explanations and bounded source paths',()=>{
  for(const [method,config] of Object.entries(aliases))for(const [field,mappings] of Object.entries(config.fields||{}))for(const mapping of mappings){
    assert.ok(mapping.field.length<=160,`${method}.${field} path is bounded`);
    assert.ok(mapping.note.length<=400,`${method}.${field} note is bounded`);
  }
});
