import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('message detail distinguishes observed provider status from local state',()=>{
 const source=readFileSync(new URL('./public/messages.js',import.meta.url),'utf8');
 const helper=source.slice(source.indexOf('function deliveryObservationSection('),source.indexOf('Object.assign(labelMap,{metadata_backfilled:'));
 const context={kv:(k,v)=>`${k}: ${v}`,fmt:v=>v,badge:v=>v};vm.createContext(context);vm.runInContext(helper,context);
 const html=context.deliveryObservationSection({source:'baileys.messages.update',raw_status_code:5,interpreted_status:'played',observed_at:'2026-10-03T12:00:00Z',observations:[{}]});
 assert.match(html,/Código original: 5/);
 assert.match(html,/Interpretación: Reproducido/);
 assert.match(html,/máximo de 20 señales/);
 assert.match(html,/no confirma el historial completo/);
 assert.match(context.deliveryObservationSection(null),/no acredita por sí solo un recibo remoto/);
 assert.match(source,/deliveryObservationSection\(detail\.delivery_observation\)/);
 const receipts=context.receiptObservationSection([{participant:'participant@lid',read_timestamp:{raw:'1767315660',iso:'2026-01-02T01:01:00Z'},persisted_at:'2026-01-02T01:02:00Z'}]);
 assert.match(receipts,/readTimestamp · valor recibido: 1767315660/);
 assert.match(receipts,/sin el tipo original no se distingue cuál ocurrió/);
 assert.match(context.receiptObservationSection([]),/No hay marcas por participante persistidas/);
 assert.match(source,/receiptObservationSection\(detail\.receipt_observations\)/);
});
