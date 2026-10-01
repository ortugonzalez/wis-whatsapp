import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('./public/capability-audit.js',import.meta.url),'utf8');
const end=source.indexOf('const capabilitiesBeforeAudit=');
if(end<0)throw new Error('observed_variable_evidence_not_found');
const context={exactObservedPath:value=>value.startsWith('$.')?value.slice(2):value,fmt:value=>`fecha ${value}`,window:{}};
const getEvidence=runInNewContext(`${source.slice(0,end)}; observedVariableEvidence`,context);
const liveSource=readFileSync(new URL('./public/live.js',import.meta.url),'utf8');
const mapStart=liveSource.indexOf('function exactObservedFieldMap('),mapEnd=liveSource.indexOf('\ncapabilities=',mapStart);
if(mapStart<0||mapEnd<0)throw new Error('exact_observed_field_map_not_found');
const getObservedFieldMap=runInNewContext(`${liveSource.slice(mapStart,mapEnd)}; exactObservedFieldMap`,context);

function evidence({textCount=0,field='name',fieldPath='name',snapshotUpdatedAt='2026-09-30T12:00:00.000Z'}={}){
 const aliases={getcontactprofile:{source_kinds:['contact'],fields:{[fieldPath]:[{kind:'contact',field,note:'texto del perfil',requires_non_empty_text:true}]}}};
 const map=new Map([[field,[{kind:'contact',records:1,total:1,non_empty_text_records:textCount,snapshot_updated_at:snapshotUpdatedAt,value:'valor privado de prueba'}]]]);
 context.window={WIS_COVERAGE_AVAILABLE:true,WIS_WHAPI_FIELD_ALIASES:aliases,WIS_OBSERVED_FIELD_MAP:map};
 return getEvidence({capability_id:'getcontactprofile',direction:'response',field_path:fieldPath});
}

test('empty observed text cannot satisfy an alias that requires non-empty text',()=>{
 const result=evidence();
 assert.match(result,/Equivalencia revisada sin observación/);
 assert.doesNotMatch(result,/Ruta exacta/);
});

test('non-empty observed text satisfies only the reviewed alias and reports counts',()=>{
 assert.match(evidence({textCount:1}),/Equivalencia observada contact\.name · 1\/1 · texto 1\/1/);
 assert.match(evidence({textCount:1}),/snapshot guardado fecha 2026-09-30T12:00:00\.000Z/);
});

test('snapshot timestamps are not described as last observation times',()=>{
 assert.match(evidence({textCount:1,snapshotUpdatedAt:null}),/snapshot guardado fecha no disponible/);
 assert.doesNotMatch(evidence({textCount:1}),/última observación/);
});

test('field coverage preserves each source observation timestamp for the UI',()=>{
 const timestamp='2026-09-30T12:00:00.000Z';
 const map=getObservedFieldMap({snapshot_kinds:[{kind:'contact',records:2,field_counts:[{field:'$.name',records:1,snapshot_updated_at:timestamp}]}]});
 assert.equal(map.get('name')[0].snapshot_updated_at,timestamp);
});

test('field timestamp labels describe snapshot writes rather than confirmed observations',()=>{
 assert.match(source,/snapshot guardado/);
 assert.match(source,/no cuándo se observó por última vez ese valor/);
 assert.match(liveSource,/snapshot guardado/);
 assert.match(liveSource,/no cuándo se observó por última vez el campo/);
});

test('a field value itself is never included in availability evidence',()=>{
  const result=evidence({textCount:1});
  assert.doesNotMatch(result,/valor privado/);
});

test('non-equivalent image fields show the documented contract gap without claiming observation',()=>{
  const aliasesContext={window:{}};
  runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),aliasesContext);
  context.window={WIS_COVERAGE_AVAILABLE:true,WIS_WHAPI_FIELD_ALIASES:aliasesContext.window.WIS_WHAPI_FIELD_ALIASES,WIS_OBSERVED_FIELD_MAP:new Map([['filename',[{kind:'avatar',records:2,total:2}] ]])};
  const result=getEvidence({capability_id:'getcontactprofile',direction:'response',field_path:'icon'});
  assert.match(result,/Sin equivalencia local: La lectura Baileys obtiene una URL temporal de miniatura que WIS cachea/);
  assert.doesNotMatch(result,/Equivalencia observada/);
});

test('WHAPI label association evidence uses only observed active chat associations',async()=>{
 const aliasesContext={window:{}};
 runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js',import.meta.url),'utf8'),aliasesContext);
 context.window={WIS_COVERAGE_AVAILABLE:true,WIS_WHAPI_FIELD_ALIASES:aliasesContext.window.WIS_WHAPI_FIELD_ALIASES,WIS_OBSERVED_FIELD_MAP:new Map([['chatId',[{kind:'label_chat_association',records:1,total:1,non_empty_text_records:1,snapshot_updated_at:'2026-10-01T00:00:00.000Z'}]]])};
 const result=getEvidence({capability_id:'getlabelassociations',direction:'response',field_path:'chats[].id'});
 assert.match(result,/Equivalencia observada label_chat_association\.chatId/);
 assert.match(result,/eventos Baileys/);
 assert.match(result,/no recupera asociaciones históricas/);
});
