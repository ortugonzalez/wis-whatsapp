import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{runInNewContext}from'node:vm';
const source=readFileSync(new URL('./public/explorer.js',import.meta.url),'utf8');const c={esc:v=>String(v).replaceAll('<','&lt;'),fmt:v=>v,badge:v=>v,table:(heads,rows)=>JSON.stringify({heads,rows})};runInNewContext(source.slice(source.indexOf('function presenceObservationSection(')),c);
test('presence card uses individual observation dates, preserves zero and never claims current presence',()=>{
 const html=c.presenceObservationSection({updated_at:'2030-01-01',data:{presences:{'<fixture>':{lastKnownPresence:'available',lastSeen:0,groupOnlineCount:0,observed_at:'2026-01-01'},unknown:{lastKnownPresence:'untrusted',lastSeen:'42'}}}});
 assert.ok(html.includes('Disponible (observado)'));assert.ok(html.includes('2026-01-01'));assert.ok(!html.includes('2030'));assert.ok(html.includes('Sin fecha de observación'));assert.ok(html.includes('Estado no reconocido'));assert.ok(html.includes('No confirma'));assert.ok(html.includes('"0","0"'));assert.ok(!html.includes('<fixture>'));assert.ok(!html.includes('untrusted'));
 const empty=c.presenceObservationSection(null);assert.ok(empty.includes('No significa que esté desconectado'));
 assert.ok(c.presenceObservationSection({data:{presences_truncated:true,presences:{}}}).includes('Respuesta parcial'));
 assert.ok(c.presenceObservationSection({data:{presences:{fixture:{lastKnownPresence:'constructor'}}}}).includes('Estado no reconocido'));
});
