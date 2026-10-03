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

test('recovered overview and coverage requests clear only their stale page error',()=>{
 for(const path of ['/api/v1/overview','/api/v1/coverage']){
  const error={textContent:`El servicio no respondió para ${path}`,classList:{add(value){this.value=value;}}};
  assert.equal(context.clearRecoveredOverviewError(error),true);
  assert.equal(error.textContent,'');
  assert.equal(error.classList.value,'hidden');
 }
 const unrelated={textContent:'Error de autenticación',classList:{add(){throw new Error('No debe ocultar errores ajenos');}}};
 assert.equal(context.clearRecoveredOverviewError(unrelated),false);
 assert.equal(unrelated.textContent,'Error de autenticación');
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

test('scheduled newsletter jobs are labeled distinctly from the channels view',async()=>{
 const scheduledReads=await readFile(new URL('./public/scheduled-reads.js',import.meta.url),'utf8');
 assert.match(source,/newsletters:'Canales \(newsletters\)'/);
 assert.match(scheduledReads,/newsletters:'Canales \(newsletters\)'/);
});
test('last scheduled read describes command state without claiming successful reception',()=>{
 context.fmt=value=>value;
 assert.equal(context.lastScheduledReadLabel({}), 'Sin lectura programada registrada');
 assert.equal(context.lastScheduledReadLabel({last_kind:'private-unknown'}), 'Sin lectura programada registrada');
 assert.equal(context.lastScheduledReadLabel({last_kind:'constructor'}), 'Sin lectura programada registrada');
 for(const [status,label] of [['pending','En cola'],['running','En curso'],['done','Comando finalizado'],['failed','Falló'],['constructor','Resultado no informado']]){
  const result=context.lastScheduledReadLabel({last_kind:'catalog',last_status:status,last_enqueued_at:'2026-10-03T09:00:00Z'});
  assert.equal(result,`Catálogo comercial · ${label} · encolada 2026-10-03T09:00:00Z`);
 }
 assert.equal(context.lastScheduledReadLabel({last_kind:'catalog',last_status:'done',last_enqueued_at:'secret-invalid'}),'Catálogo comercial · Comando finalizado');
});

test('rendered observability distinguishes message dates and lease evidence from reception',async()=>{
 const section={isConnected:true,innerHTML:''};
 const coverage={last_live_message_at:'2026-01-01T00:00:00.000Z',live_inbound_count:14,snapshot_kinds:[]};
 let lease;
 const scope={overview(){},login(){},state:{page:'overview'},viewEpoch:1,window:{addEventListener(){}},clearInterval(){},setInterval(){},document:{getElementById:id=>id==='overview-observability'?section:null},api:async path=>path.endsWith('/coverage')?coverage:path.endsWith('/settings')?{scheduled_reads:{worker_lease_current:lease}}:{status:'connected',identity_verified:true},fmt:value=>value,esc:value=>String(value),badge:()=>''};
 runInNewContext(source,scope);
 for(const [value,label] of [[undefined,'Lease no informado'],[false,'Sin lease vigente'],[true,'Lease vigente']]){
  lease=value;await scope.refreshOverviewObservability();
  assert.ok(section.innerHTML.includes(label));
  assert.match(section.innerHTML,/Fecha del último entrante · origen live/);
  assert.match(section.innerHTML,/no la hora de recepción/);
  assert.match(section.innerHTML,/no recepción reciente/);
  assert.match(section.innerHTML,/Fallos de lectura acumulados/);
  assert.match(section.innerHTML,/Última lectura programada/);
  assert.match(section.innerHTML,/Un comando finalizado no garantiza datos completos ni recepción de mensajes/);
  assert.doesNotMatch(section.innerHTML,/Última recepción observada/);
 }
 coverage.last_live_message_at=null;await scope.refreshOverviewObservability();
 assert.match(section.innerHTML,/Sin mensaje entrante de origen live almacenado/);
});
