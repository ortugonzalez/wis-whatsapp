import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source=await readFile(new URL('./public/overview-observability.js',import.meta.url),'utf8');
const context={overview(){},login(){},state:{page:'idle'},viewEpoch:0,window:{addEventListener(){}},clearInterval(){},setInterval(){},document:{}};
runInNewContext(source,context);

test('live reconnect error overrides qr_pending without an available QR',()=>{
 assert.equal(context.connectionStatusLabel({status:'qr_pending',last_error:'reconnecting'}),'Reconectando');
});

test('a QR state is shown only without an active reconnect error',()=>{
 assert.equal(context.connectionStatusLabel({status:'qr_pending',last_error:null}),'Esperando el escaneo del QR');
});

test('exhausted and identity errors are shown as operational states',()=>{
 assert.equal(context.connectionStatusLabel({status:'disconnected',last_error:'reconnect_exhausted'}),'Desconectado · reconexión pausada');
 assert.equal(context.connectionStatusLabel({status:'connected',last_error:'identity_mismatch'}),'Identidad no coincide');
});

test('overview field total includes snapshots, normalized storage, and contextual fields',()=>{
 assert.equal(context.observedFieldCount({snapshot_kinds:[{field_counts:[{},{}]}],storage_kinds:[{field_counts:[{}]}],contextual_kinds:[{field_counts:[{},{},{}]}]}),6);
});

test('overview field total tolerates absent coverage sections',()=>{
 assert.equal(context.observedFieldCount({snapshot_kinds:[{field_counts:null}],storage_kinds:null}),0);
});

test('overview picks the most recent valid snapshot write without treating it as field freshness',()=>{
 assert.equal(context.latestSnapshotAt({snapshot_kinds:[{last_updated_at:'2026-09-28T10:00:00.000Z'},{last_updated_at:'invalid'},{last_updated_at:'2026-09-29T08:00:00.000Z'}]}),'2026-09-29T08:00:00.000Z');
 assert.equal(context.latestSnapshotAt({snapshot_kinds:[]}),null);
 assert.equal(context.latestSnapshotAt({snapshot_kinds:{last_updated_at:'2026-09-29T08:00:00.000Z'}}),null);
 assert.equal(context.latestSnapshotAt({snapshot_kinds:[null,{}]}),null);
});

test('scheduled reads distinguish overdue blocked work from future and paused schedules',()=>{
 context.fmt=value=>`Fecha ${value}`;
 assert.equal(context.scheduledRunAtLabel({enabled:true,due:true,blocked_reason:'connection_required',next_run_at:'2026-09-28T14:15:20.075Z'}),'Vencida · requiere conexión verificada');
 assert.equal(context.scheduledRunAtLabel({enabled:true,due:true,blocked_reason:'read_in_progress',next_run_at:'2026-09-28T14:15:20.075Z'}),'Vencida · pendiente de ejecutar');
 assert.equal(context.scheduledRunAtLabel({enabled:true,due:false,next_run_at:'2026-09-28T21:00:00.000Z'}),'Fecha 2026-09-28T21:00:00.000Z');
 assert.equal(context.scheduledRunAtLabel({enabled:false,next_run_at:null}),'Pausada');
});
