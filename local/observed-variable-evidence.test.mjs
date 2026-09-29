import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('./public/capability-audit.js',import.meta.url),'utf8');
const end=source.indexOf('const capabilitiesBeforeAudit=');
if(end<0)throw new Error('observed_variable_evidence_not_found');
const context={exactObservedPath:value=>value.startsWith('$.')?value.slice(2):value,window:{}};
const getEvidence=runInNewContext(`${source.slice(0,end)}; observedVariableEvidence`,context);

function evidence({textCount=0,field='name',fieldPath='name'}={}){
 const aliases={getcontactprofile:{source_kinds:['contact'],fields:{[fieldPath]:[{kind:'contact',field,note:'texto del perfil',requires_non_empty_text:true}]}}};
 const map=new Map([[field,[{kind:'contact',records:1,total:1,non_empty_text_records:textCount,value:'valor privado de prueba'}]]]);
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
});

test('a field value itself is never included in availability evidence',()=>{
 const result=evidence({textCount:1});
 assert.doesNotMatch(result,/valor privado/);
});
