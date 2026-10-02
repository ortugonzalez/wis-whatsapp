'use strict';
const overviewBeforeObservability=overview;
const scheduledKindNames={all:'Cuenta y grupos',blocklist:'Lista de bloqueos',communities:'Comunidades',catalog:'Catálogo comercial',collections:'Colecciones',newsletters:'Canales (newsletters)',account_limits:'Límites de la cuenta',account_username:'Nombre de usuario',contact_profiles:'Perfiles de contactos',group_requests:'Solicitudes de grupos',avatars:'Fotos de perfil',bot_list:'Bots de la cuenta',disappearing_mode:'Temporizador de mensajes',community_subgroups:'Subgrupos de comunidades'};
const scheduledGateNames={disabled:'Pausada',not_due:'Dentro del intervalo',read_in_progress:'Esperando que termine otra lectura',connection_required:'Esperando conexión verificada',worker_unavailable:'Esperando un worker activo',known_community_required:'Esperando una comunidad conocida'};
let overviewObservabilityTimer=null;
let overviewObservabilityInFlight=false;
function connectionStatusLabel(connection){
 if(connection.last_error==='reconnecting')return 'Reconectando';
 if(connection.last_error==='reconnect_exhausted')return 'Desconectado · reconexión pausada';
 if(connection.last_error==='session_revoked')return 'Sesión revocada';
 if(connection.last_error==='identity_mismatch')return 'Identidad no coincide';
 if(connection.last_error==='identity_unverified')return 'Identidad pendiente';
 return connection.status==='connected'?(connection.identity_verified?'Conectado · identidad verificada':'Conectado · identidad pendiente'):connection.status==='qr_pending'?'Esperando el escaneo del QR':connection.status==='connecting'?'Conectando':connection.status==='reconnecting'?'Reconectando':connection.status==='disconnected'?'Desconectado':'Estado no disponible';
}
function observedFieldCount(coverage){return ['snapshot_kinds','storage_kinds','contextual_kinds'].reduce((count,section)=>count+(coverage[section]||[]).reduce((sum,row)=>sum+(Array.isArray(row.field_counts)?row.field_counts.length:0),0),0);}
function latestSnapshotAt(coverage){return (Array.isArray(coverage?.snapshot_kinds)?coverage.snapshot_kinds:[]).map(row=>row?.last_updated_at).filter(value=>typeof value==='string'&&Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;}
function scheduledRunAtLabel(schedule){if(!schedule.enabled)return 'Pausada';if(schedule.due&&schedule.blocked_reason==='connection_required')return 'Vencida · requiere conexión verificada';if(schedule.due)return 'Vencida · pendiente de ejecutar';return schedule.next_run_at?fmt(schedule.next_run_at):'Sin próxima ejecución';}
function stopOverviewObservability(){clearInterval(overviewObservabilityTimer);overviewObservabilityTimer=null;}
window.addEventListener('hashchange',stopOverviewObservability);
const loginBeforeOverviewObservability=login;
login=function(...args){stopOverviewObservability();return loginBeforeOverviewObservability(...args);};
async function refreshOverviewObservability(){
 if(state.page!=='overview'||overviewObservabilityInFlight||!document.getElementById('overview-observability'))return;
 const section=document.getElementById('overview-observability');
 const epoch=viewEpoch;
 overviewObservabilityInFlight=true;
 try{
  const [coverage,settings,connection]=await Promise.all([api('/api/v1/coverage'),api('/api/v1/settings'),api('/api/whatsapp/connection')]);
  if(state.page!=='overview'||epoch!==viewEpoch||!section.isConnected)return;
  const pageError=document.getElementById('page-error');
  if(pageError?.textContent.includes('/api/v1/coverage')){pageError.textContent='';pageError.classList.add('hidden');}
  const schedule=settings.scheduled_reads||{};
  const failedReads=(coverage.read_commands||[]).filter(row=>row.status==='failed').reduce((sum,row)=>sum+(Number.isInteger(row.count)?row.count:0),0);
  const observedFields=observedFieldCount(coverage);
  const lastInbound=coverage.last_live_message_at?fmt(coverage.last_live_message_at):'Sin recepción en vivo observada';
  const lastSnapshot=latestSnapshotAt(coverage);
  const snapshotKinds=Array.isArray(coverage.snapshot_kinds)?coverage.snapshot_kinds:[];
  const connectionStatus=connectionStatusLabel(connection);
  const lastDisconnect=connection.last_disconnect?.at?`${fmt(connection.last_disconnect.at)} · ${connection.last_disconnect.reason||'causa no disponible'}${Number.isInteger(connection.last_disconnect.status_code)?` (${connection.last_disconnect.status_code})`:''}`:'Sin cierres registrados';
  const next=schedule.next_kind?scheduledKindNames[schedule.next_kind]||'Lectura programada':'Sin ruta programada';
  const gate=schedule.enabled?(scheduledGateNames[schedule.blocked_reason]||(schedule.due?'Lista para ejecutar':'Dentro del intervalo')):'Pausada';
  const nextAt=scheduledRunAtLabel(schedule);
  section.innerHTML=`<header class="card-head"><div><h2>Datos observados y actualización</h2><p>Agregados locales; contenido de conversaciones y datos personales excluidos de este resumen.</p></div>${badge(schedule.enabled?'Lecturas activas':'Lecturas pausadas',schedule.enabled?'':'amber')}</header><div class="card-body"><div class="grid columns"><div><div class="kv"><span>Estado WhatsApp</span><strong>${esc(connectionStatus)}</strong></div><div class="kv"><span>Worker Baileys</span><strong>${schedule.worker_lease_current?'Activo':'Sin lease vigente'}</strong></div><div class="kv"><span>Último cierre observado</span><strong>${esc(lastDisconnect)}</strong></div><div class="kv"><span>Mensajes entrantes en vivo</span><strong>${Number(coverage.live_inbound_count)||0}</strong></div><div class="kv"><span>Última recepción observada</span><strong>${esc(lastInbound)}</strong></div><div class="kv"><span>Última escritura de snapshot</span><strong>${lastSnapshot?esc(fmt(lastSnapshot)):snapshotKinds.length?'Fecha de escritura no disponible':'Sin snapshots guardados'}</strong></div><div class="kv"><span>Tipos de datos guardados</span><strong>${snapshotKinds.length}</strong></div><div class="kv"><span>Campos listados en cobertura</span><strong>${observedFields}</strong></div><div class="kv"><span>Lecturas fallidas registradas</span><strong>${failedReads}</strong></div></div><div><div class="kv"><span>Estado del recolector</span><strong>${esc(gate)}</strong></div><div class="kv"><span>Próxima ruta</span><strong>${esc(next)}</strong></div><div class="kv"><span>Próxima revisión</span><strong>${esc(nextAt)}</strong></div><div class="kv"><span>Historial completo</span><strong>No; depende de lo que WhatsApp entregue</strong></div><p class="muted">La escritura de un snapshot no prueba que cada campo se haya actualizado en esa fecha.</p><a class="text-link" href="#settings">Ver programación y detalle →</a></div></div></div>`;
 }catch(error){if(state.page==='overview'&&epoch===viewEpoch&&section.isConnected)section.textContent='No se pudo actualizar el resumen de datos: '+error.message;}
 finally{overviewObservabilityInFlight=false;}
}
overview=async function(){
 await overviewBeforeObservability();
 if(state.page!=='overview')return;
 let section=document.getElementById('overview-observability');
 if(!section){section=document.createElement('section');section.id='overview-observability';section.className='card spaced';section.innerHTML='<div class="card-body">Consultando lecturas y cobertura local…</div>';document.querySelector('#content .grid.stats')?.after(section);}
 const epoch=viewEpoch;
 await refreshOverviewObservability();
 if(state.page!=='overview'||epoch!==viewEpoch||!section.isConnected)return;
 if(!overviewObservabilityTimer)overviewObservabilityTimer=setInterval(()=>void refreshOverviewObservability(),15000);
};
