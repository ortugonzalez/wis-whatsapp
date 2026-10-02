import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

test('field audit separates exact observations, reviewed aliases, and unobserved definitions without values',()=>{
  const reference={captured_at:'2026-09-28T00:00:00.000Z',methods:[{id:'getchat',operations:[{parameters:[{name:'chat_id'}],request_fields:[{path:'message.text'}],response_fields:{200:[{path:'messages[].id'},{path:'messages[].text'},{path:'messages[].secret'}]}}]}]};
  const coverage={snapshot_kinds:[{kind:'chat',field_counts:[{field:'$.messages[0].id',records:2},{field:'$.messages[0].body',records:1,non_empty_text_records:1}]}],storage_kinds:[],contextual_kinds:[]};
  const aliases={getchat:{source_kinds:['chat'],fields:{'messages[].text':[{kind:'chat',field:'messages[].body',note:'reviewed'}]},non_equivalent_fields:['messages[].secret']}};
  const report=summarizeCapabilityFieldCoverage(reference,coverage,aliases);
  assert.deepEqual(report.totals,{parameter_fields:1,request_fields:1,response_fields:3,exact_response_fields_observed:1,semantic_response_fields_observed:1,fresh_response_fields_observed:2,stale_only_response_fields:0,response_fields_without_observation:1});
  assert.deepEqual(report.method_coverage,{response_methods:1,methods_with_any_observed_response:1,methods_without_observed_response:0,methods_with_all_response_fields_observed:0});
  assert.equal(report.methods[0].id,'getchat');assert.equal(JSON.stringify(report).includes('secret-value'),false);
});

test('message media aliases require the matching type-scoped metadata evidence',()=>{
  const reference={methods:[{id:'getmessage',operations:[{response_fields:{200:[{path:'image.mime_type'},{path:'video.mime_type'},{path:'location.latitude'}]}}]}]};
  const aliases={getmessage:{source_kinds:['messages'],fields:{
    'image.mime_type':[{kind:'message_image',field:'details.mimetype',note:'image-scoped'}],
    'video.mime_type':[{kind:'message_video',field:'details.mimetype',note:'video-scoped'}],
    'location.latitude':[{kind:'message_location',field:'details.degreesLatitude',note:'location-scoped'}],
  }}};
  const coverage={snapshot_kinds:[],storage_kinds:[],contextual_kinds:[
    {kind:'message_image',field_counts:[{field:'$.details.mimetype',records:3,non_empty_text_records:3}]},
    {kind:'message_video',field_counts:[{field:'$.details.mimetype',records:2,non_empty_text_records:2}]},
    {kind:'message_audio',field_counts:[{field:'$.details.mimetype',records:20,non_empty_text_records:20}]},
  ]};
  const report=summarizeCapabilityFieldCoverage(reference,coverage,aliases);
  assert.equal(report.totals.semantic_response_fields_observed,2);
  assert.equal(report.totals.fresh_response_fields_observed,2);
  assert.equal(report.totals.response_fields_without_observation,1);
  assert.equal(JSON.stringify(report).includes('image/jpeg'),false);
});

test('empty media text metadata does not count as observed while non-empty type-scoped text does',()=>{
  const reference={methods:[{id:'getmessage',operations:[{response_fields:{200:[{path:'image.mime_type'},{path:'video.mime_type'}]}}]}]};
  const aliases={getmessage:{source_kinds:['messages'],fields:{
    'image.mime_type':[{kind:'message_image',field:'details.mimetype',note:'image-scoped',requires_non_empty_text:true}],
    'video.mime_type':[{kind:'message_video',field:'details.mimetype',note:'video-scoped',requires_non_empty_text:true}],
  }}};
  const emptyImage={snapshot_kinds:[],storage_kinds:[],contextual_kinds:[
    {kind:'message_image',field_counts:[{field:'$.details.mimetype',records:1,non_empty_text_records:0}]},
    {kind:'message_video',field_counts:[{field:'$.details.mimetype',records:1,non_empty_text_records:1}]},
  ]};
  const partiallyObserved=summarizeCapabilityFieldCoverage(reference,emptyImage,aliases);
  assert.equal(partiallyObserved.totals.semantic_response_fields_observed,1);
  assert.equal(partiallyObserved.totals.response_fields_without_observation,1);
  const nonEmptyImage={...emptyImage,contextual_kinds:emptyImage.contextual_kinds.map(item=>item.kind==='message_image'?{...item,field_counts:[{field:'$.details.mimetype',records:1,non_empty_text_records:1}]}:item)};
  const observed=summarizeCapabilityFieldCoverage(reference,nonEmptyImage,aliases);
  assert.equal(observed.totals.semantic_response_fields_observed,2);
  assert.equal(observed.totals.response_fields_without_observation,0);
});

test('field audit reports observed routes backed only by explicitly stale evidence separately',()=>{
  const reference={methods:[{id:'getcontactprofile',operations:[{response_fields:{200:[{path:'id'},{path:'name'},{path:'about'}]}}]}]};
  const coverage={snapshot_kinds:[{kind:'contact',field_counts:[
    {field:'$.id',records:2,stale_records:1},
    {field:'$.about',records:1,non_empty_text_records:1,stale_records:1,stale_non_empty_text_records:1},
    {field:'$.name',records:2,non_empty_text_records:2,stale_records:2,stale_non_empty_text_records:2},
  ]}],storage_kinds:[],contextual_kinds:[]};
  const aliases={getcontactprofile:{source_kinds:['contact'],fields:{name:[{kind:'contact',field:'name',requires_non_empty_text:true}]}}};
  const report=summarizeCapabilityFieldCoverage(reference,coverage,aliases);
  assert.deepEqual(report.methods[0],{id:'getcontactprofile',parameter_fields:0,request_fields:0,response_fields:3,exact_response_fields_observed:2,semantic_response_fields_observed:1,fresh_response_fields_observed:1,stale_only_response_fields:2,response_fields_without_observation:0});
  assert.equal(report.totals.fresh_response_fields_observed,1);
  assert.equal(report.totals.stale_only_response_fields,2);
  assert.equal(report.totals.response_fields_without_observation,0);
  assert.equal(JSON.stringify(report).includes('old value'),false);
});

test('field audit requires positive and meaningful evidence and excludes local provenance fields',()=>{
  const reference={methods:[{id:'getchat',operations:[{response_fields:{200:[{path:'messages[].id'},{path:'contact.name'},{path:'messages[].source'},{path:'last_message.source'}]}}]}]};
  const coverage={snapshot_kinds:[{kind:'chat',field_counts:[
    {field:'messages[0].id',records:0},
    {field:'contact.name',records:1,non_empty_text_records:0},
    {field:'messages[0].source',records:4,non_empty_text_records:4},
    {field:'last_message.source',records:3,non_empty_text_records:3},
  ]}],storage_kinds:[],contextual_kinds:[]};
  const aliases={getchat:{source_kinds:['chat'],fields:{'contact.name':[
    {kind:'chat',field:'contact.name',requires_non_empty_text:true},
    {kind:'chat',field:'contact.display_name',requires_non_empty_text:true},
  ]}}};
  const report=summarizeCapabilityFieldCoverage(reference,coverage,aliases);
  assert.equal(report.totals.exact_response_fields_observed,0);
  assert.equal(report.totals.semantic_response_fields_observed,0);
  assert.equal(report.totals.response_fields_without_observation,4);
  assert.equal(report.method_coverage.methods_without_observed_response,1);
});

test('business profile observes WHAPI hours containers only when Baileys persisted them',()=>{
  const reference={methods:[{id:'getbusinessprofile',operations:[{response_fields:{200:[{path:'hours'},{path:'hours.config'}]}}]}]};
  const aliases={getbusinessprofile:{source_kinds:['business','contact'],fields:{
    hours:[
      {kind:'business',field:'business_hours',note:'own profile hours object'},
      {kind:'contact',field:'business_profile.business_hours',note:'contact profile hours object'},
    ],
    'hours.config':[
      {kind:'business',field:'business_hours.config[]',note:'own profile hours list'},
      {kind:'contact',field:'business_profile.business_hours.config[]',note:'contact profile hours list'},
    ],
  }}};
  const noHours={snapshot_kinds:[{kind:'business',field_counts:[]}],storage_kinds:[],contextual_kinds:[]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,noHours,aliases).totals.response_fields_without_observation,2);
  const observed={snapshot_kinds:[{kind:'business',field_counts:[
    {field:'$.business_hours',records:1},
    {field:'$.business_hours.config[0]',records:1},
  ]}],storage_kinds:[],contextual_kinds:[]};
  const report=summarizeCapabilityFieldCoverage(reference,observed,aliases);
  assert.equal(report.totals.semantic_response_fields_observed,2);
  assert.equal(report.totals.response_fields_without_observation,0);
  const contactObserved={snapshot_kinds:[{kind:'contact',field_counts:[
    {field:'$.business_profile.business_hours',records:1},
    {field:'$.business_profile.business_hours.config[0]',records:1},
  ]}],storage_kinds:[],contextual_kinds:[]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,contactObserved,aliases).totals.semantic_response_fields_observed,2);
});

test('field audit gives a reviewed same-path alias the same semantic classification as the detail view',()=>{
  const reference={methods:[{id:'getchat',operations:[{response_fields:{200:[{path:'messages[].body'}]}}]}]};
  const coverage={snapshot_kinds:[{kind:'chat',field_counts:[{field:'messages[0].body',records:2,non_empty_text_records:2}]}],storage_kinds:[],contextual_kinds:[]};
  const aliases={getchat:{source_kinds:['chat'],fields:{'messages[].body':[{kind:'chat',field:'messages[].body',note:'reviewed'}]}}};
  const report=summarizeCapabilityFieldCoverage(reference,coverage,aliases);
  assert.equal(report.totals.semantic_response_fields_observed,1);
  assert.equal(report.totals.exact_response_fields_observed,0);
  assert.equal(report.totals.response_fields_without_observation,0);
  assert.equal(report.method_coverage.methods_with_all_response_fields_observed,1);
});

test('group invite coverage requires a current non-empty ephemeral code',()=>{
  const reference={methods:[{id:'getgroup',operations:[{response_fields:{200:[{path:'invite_code'}]}}]}]};
  const aliases={getgroup:{source_kinds:['group','group_invite'],fields:{invite_code:[{kind:'group_invite',field:'code',note:'known-group invite code with TTL',requires_non_empty_text:true}]}}};
  const groupOnly={snapshot_kinds:[{kind:'group',field_counts:[{field:'id',records:1}]}],storage_kinds:[],contextual_kinds:[]};
  const missing=summarizeCapabilityFieldCoverage(reference,groupOnly,aliases);
  assert.equal(missing.totals.semantic_response_fields_observed,0);
  const expired={...groupOnly,snapshot_kinds:[...groupOnly.snapshot_kinds,{kind:'group_invite',field_counts:[{field:'code',records:1,non_empty_text_records:0}]}]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,expired,aliases).totals.response_fields_without_observation,1);
  const fresh={...groupOnly,snapshot_kinds:[...groupOnly.snapshot_kinds,{kind:'group_invite',field_counts:[{field:'code',records:1,non_empty_text_records:1}]}]};
  const verified=summarizeCapabilityFieldCoverage(reference,fresh,aliases);
  assert.equal(verified.totals.semantic_response_fields_observed,1);
  assert.equal(verified.totals.response_fields_without_observation,0);
});

test('group creator evidence comes only from Baileys owner metadata in group scope',()=>{
  const reference={methods:[
    {id:'getgroup',operations:[{response_fields:{200:[{path:'created_by'}]}}]},
    {id:'getgroups',operations:[{response_fields:{200:[{path:'groups[].created_by'}]}}]},
  ]};
  const aliases={
    getgroup:{source_kinds:['group'],fields:{created_by:[{kind:'group',field:'owner',note:'group creator JID'}]}},
    getgroups:{source_kinds:['group'],fields:{'groups[].created_by':[{kind:'group',field:'owner',note:'group creator JID'}]}},
  };
  const unrelated={snapshot_kinds:[{kind:'contact',field_counts:[{field:'owner',records:18,non_empty_text_records:18}]}],storage_kinds:[],contextual_kinds:[]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,unrelated,aliases).totals.semantic_response_fields_observed,0);
  const groups={...unrelated,snapshot_kinds:[...unrelated.snapshot_kinds,{kind:'group',field_counts:[{field:'owner',records:18,non_empty_text_records:18}]}]};
  const report=summarizeCapabilityFieldCoverage(reference,groups,aliases);
  assert.equal(report.totals.semantic_response_fields_observed,2);
  assert.equal(report.totals.response_fields_without_observation,0);
});

test('community invite coverage maps only current non-empty community-scoped code',()=>{
  const reference={methods:[{id:'getcommunity',operations:[{response_fields:{200:[{path:'invite_code'}]}}]}]};
  const aliases={getcommunity:{source_kinds:['community','community_invite'],fields:{invite_code:[{kind:'community_invite',field:'code',note:'known community code with TTL',requires_non_empty_text:true}]}}};
  const base={snapshot_kinds:[{kind:'community',field_counts:[{field:'id',records:1}]}],storage_kinds:[],contextual_kinds:[]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,base,aliases).totals.response_fields_without_observation,1);
  const expired={...base,snapshot_kinds:[...base.snapshot_kinds,{kind:'community_invite',field_counts:[{field:'code',records:1,non_empty_text_records:0}]}]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,expired,aliases).totals.semantic_response_fields_observed,0);
  const fresh={...base,snapshot_kinds:[...base.snapshot_kinds,{kind:'community_invite',field_counts:[{field:'code',records:1,non_empty_text_records:1}]}]};
  const coverage=summarizeCapabilityFieldCoverage(reference,fresh,aliases);assert.equal(coverage.totals.semantic_response_fields_observed,1);assert.equal(coverage.totals.response_fields_without_observation,0);
});

test('contact profile and own username never borrow exact fields from the other identity scope',()=>{
  const reference={methods:[
    {id:'getcontactprofile',operations:[{response_fields:{200:[{path:'name'}]}}]},
    {id:'getusername',operations:[{response_fields:{200:[{path:'username'}]}}]},
  ]};
  const aliases={
    getcontactprofile:{source_kinds:['contact'],fields:{name:[{kind:'contact',field:'name',requires_non_empty_text:true}]}},
    getusername:{source_kinds:['account_username'],fields:{username:[{kind:'account_username',field:'username'}]}},
  };
  const otherIdentityOnly={snapshot_kinds:[
    {kind:'profile',field_counts:[{field:'name',records:1,non_empty_text_records:1}]},
    {kind:'contact',field_counts:[{field:'username',records:1,non_empty_text_records:1}]},
  ],storage_kinds:[],contextual_kinds:[]};
  const report=summarizeCapabilityFieldCoverage(reference,otherIdentityOnly,aliases);
  assert.equal(report.totals.exact_response_fields_observed,0);
  assert.equal(report.totals.semantic_response_fields_observed,0);
  assert.equal(report.totals.response_fields_without_observation,2);

  const correctlyScoped={snapshot_kinds:[...otherIdentityOnly.snapshot_kinds,
    {kind:'contact',field_counts:[{field:'name',records:1,non_empty_text_records:1}]},
    {kind:'account_username',field_counts:[{field:'username',records:1,non_empty_text_records:1}]},
  ],storage_kinds:[],contextual_kinds:[]};
  const verified=summarizeCapabilityFieldCoverage(reference,correctlyScoped,aliases);
  assert.equal(verified.totals.semantic_response_fields_observed,2);
  assert.equal(verified.totals.exact_response_fields_observed,0);
  assert.equal(verified.totals.response_fields_without_observation,0);
});

test('own profile push and verified names use only the own profile snapshot',()=>{
  const reference={methods:[{id:'getuserprofile',operations:[{response_fields:{200:[
    {path:'push_name'},{path:'verified_name'},
  ]}}]}]};
  const aliases={getuserprofile:{source_kinds:['profile'],fields:{
    push_name:[{kind:'profile',field:'notify'}],
    verified_name:[{kind:'profile',field:'verifiedName',requires_non_empty_text:true}],
  }}};
  const contactsOnly={snapshot_kinds:[{kind:'contact',field_counts:[
    {field:'notify',records:1,non_empty_text_records:1},
    {field:'verifiedName',records:1,non_empty_text_records:1},
  ]}],storage_kinds:[],contextual_kinds:[]};
  assert.equal(summarizeCapabilityFieldCoverage(reference,contactsOnly,aliases).totals.semantic_response_fields_observed,0);
  const profile={...contactsOnly,snapshot_kinds:[...contactsOnly.snapshot_kinds,{kind:'profile',field_counts:[
    {field:'notify',records:1,non_empty_text_records:1},
    {field:'verifiedName',records:1,non_empty_text_records:0},
  ]}]};
  const report=summarizeCapabilityFieldCoverage(reference,profile,aliases);
  assert.equal(report.totals.semantic_response_fields_observed,1);
  assert.equal(report.totals.response_fields_without_observation,1);
});

test('newsletter-message coverage excludes ordinary WhatsApp messages and accepts only channel-scoped snapshots',()=>{
  const reference={methods:[{id:'getmessagesnewsletter',operations:[{response_fields:{200:[
    {path:'messages[].id'},{path:'messages[].type'},{path:'messages[].timestamp'},{path:'messages[].text.body'},
  ]}}]}]};
  const aliases={getmessagesnewsletter:{source_kinds:['newsletter_messages'],fields:{
    'messages[].id':[{kind:'newsletter_messages',field:'messages[].id',note:'channel message ID'}],
    'messages[].type':[{kind:'newsletter_messages',field:'messages[].type',note:'channel message type'}],
    'messages[].timestamp':[{kind:'newsletter_messages',field:'messages[].date',note:'local ISO timestamp',requires_non_empty_text:true}],
    'messages[].text.body':[{kind:'newsletter_messages',field:'messages[].body',note:'channel message text',requires_non_empty_text:true}],
  }}};
  const ordinaryOnly={snapshot_kinds:[{kind:'messages',field_counts:[
    {field:'messages[0].id',records:8},{field:'messages[0].type',records:8},{field:'messages[0].date',records:8},{field:'messages[0].body',records:8,non_empty_text_records:8},
  ]}],storage_kinds:[],contextual_kinds:[]};
  const unobserved=summarizeCapabilityFieldCoverage(reference,ordinaryOnly,aliases);
  assert.equal(unobserved.totals.semantic_response_fields_observed,0);
  assert.equal(unobserved.totals.response_fields_without_observation,4);
  const channelObserved={...ordinaryOnly,snapshot_kinds:[...ordinaryOnly.snapshot_kinds,{kind:'newsletter_messages',field_counts:[
    {field:'messages[0].id',records:2},{field:'messages[0].type',records:2},{field:'messages[0].date',records:2,non_empty_text_records:2},{field:'messages[0].body',records:2,non_empty_text_records:1},
  ]}]};
  const observed=summarizeCapabilityFieldCoverage(reference,channelObserved,aliases);
  assert.equal(observed.totals.semantic_response_fields_observed,4);
  assert.equal(observed.totals.response_fields_without_observation,0);
  const nullOrEmptyDate={...channelObserved,snapshot_kinds:channelObserved.snapshot_kinds.map(snapshot=>snapshot.kind!=='newsletter_messages'?snapshot:{...snapshot,field_counts:snapshot.field_counts.map(field=>field.field==='messages[0].date'?{...field,non_empty_text_records:0}:field)})};
  const missingDate=summarizeCapabilityFieldCoverage(reference,nullOrEmptyDate,aliases);
  assert.equal(missingDate.totals.semantic_response_fields_observed,3);
  assert.equal(missingDate.totals.response_fields_without_observation,1);
});

test('community response coverage excludes generic group metadata',()=>{
  const reference={methods:[{id:'getcommunity',operations:[{response_fields:{200:[{path:'id'},{path:'participants[].id'}]}}]}]};
  const aliases={getcommunity:{source_kinds:['community']}};
  const groupsOnly={snapshot_kinds:[{kind:'group',field_counts:[
    {field:'id',records:18},{field:'participants[0].id',records:18},
  ]}],storage_kinds:[],contextual_kinds:[]};
  const unobserved=summarizeCapabilityFieldCoverage(reference,groupsOnly,aliases);
  assert.equal(unobserved.totals.exact_response_fields_observed,0);
  assert.equal(unobserved.totals.response_fields_without_observation,2);
  const communityObserved={...groupsOnly,snapshot_kinds:[...groupsOnly.snapshot_kinds,{kind:'community',field_counts:[
    {field:'id',records:1},{field:'participants[0].id',records:1},
  ]}]};
  const observed=summarizeCapabilityFieldCoverage(reference,communityObserved,aliases);
  assert.equal(observed.totals.exact_response_fields_observed,2);
  assert.equal(observed.totals.response_fields_without_observation,0);
});
