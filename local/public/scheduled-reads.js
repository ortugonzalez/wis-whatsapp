'use strict';
const settingsPageBeforeScheduledReads=settingsPage;
const scheduledReadLabels={all:'Cuenta y grupos',blocklist:'Lista de bloqueos',communities:'Comunidades',catalog:'Catálogo comercial',collections:'Colecciones',newsletters:'Canales'};
const scheduledStatusLabels={pending:'En cola',running:'En curso',done:'Completada',failed:'Fallida'};
let scheduledReadsTimer=null;
const navigateBeforeScheduledReads=navigate;
navigate=async function(...args){clearInterval(scheduledReadsTimer);scheduledReadsTimer=null;return navigateBeforeScheduledReads(...args);};
const loginBeforeScheduledReads=login;
login=function(...args){clearInterval(scheduledReadsTimer);scheduledReadsTimer=null;return loginBeforeScheduledReads(...args);};
settingsPage=async function(){
 await settingsPageBeforeScheduledReads();
 if(state.page!=='settings')return;
 clearInterval(scheduledReadsTimer);scheduledReadsTimer=null;
 const epoch=viewEpoch,preferences=document.getElementById('preferences-form')?.closest('section');
 if(!preferences)return;
 const section=document.createElement('section');section.className='card spaced';
 section.innerHTML=`<header class="card-head"><div><h2>Recolección automática de datos</h2><p>Consulta de solo lectura; no envía mensajes ni cambia tu cuenta.</p></div></header><div class="card-body"><form class="form-grid" data-scheduled-reads-form><label class="full"><span><input name="enabled" type="checkbox"> Activar lecturas periódicas</span></label><label>Intervalo<select name="interval_minutes"><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60">60 minutos</option><option value="120">120 minutos</option></select></label><p class="field-note">Rota entre cuenta/grupos, bloqueos, comunidades, catálogo, colecciones y canales. Si otra lectura sigue en curso, espera antes de encolar la siguiente.</p><p class="small muted full" data-scheduled-reads-status>Consultando programación…</p><button class="btn primary full">Guardar programación</button></form></div>`;
 preferences.after(section);
 const form=section.querySelector('[data-scheduled-reads-form]'),status=section.querySelector('[data-scheduled-reads-status]');
 form.addEventListener('input',()=>{form.dataset.dirty='true';});
 const refresh=async()=>{const current=await api('/api/v1/settings');if(epoch!==viewEpoch||state.page!=='settings')return;const schedule=current.scheduled_reads||{};if(form.dataset.dirty!=='true'){form.elements.enabled.checked=schedule.enabled===true;form.elements.interval_minutes.value=String(schedule.interval_minutes||15);}const next=schedule.next_run_at?fmt(schedule.next_run_at):'sin próxima ejecución';const last=schedule.last_enqueued_at?`${scheduledReadLabels[schedule.last_kind]||'Lectura'} · ${fmt(schedule.last_enqueued_at)} · ${scheduledStatusLabels[schedule.last_status]||'estado pendiente'}`:'todavía no ejecutada';status.textContent=`Estado: ${schedule.enabled?'activa':'pausada'} · Próxima: ${schedule.enabled?next:'pausada'} · Última: ${last}`;};
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await api('/api/v1/settings','PATCH',{scheduled_reads_enabled:form.elements.enabled.checked,scheduled_reads_interval_minutes:Number(form.elements.interval_minutes.value)});form.dataset.dirty='false';toast('Programación de lecturas guardada.');await refresh();}catch(error){showError(error.message);}finally{button.disabled=false;}};
 try{await refresh();if(epoch!==viewEpoch||state.page!=='settings')return;scheduledReadsTimer=setInterval(()=>{if(epoch===viewEpoch&&state.page==='settings')void refresh().catch(error=>{status.textContent='No se pudo consultar la programación: '+error.message;});},15_000);}catch(error){if(epoch===viewEpoch&&state.page==='settings')status.textContent='No se pudo consultar la programación: '+error.message;}
};
