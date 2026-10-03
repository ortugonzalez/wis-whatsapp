'use strict';
function contactAvatarSummaryHtml(data) {
 const count=key=>Number.isSafeInteger(data[key])&&data[key]>=0?data[key]:'—';
 const rows=[['cached_current','Caché con disponibilidad declarada'],['cached_stale','Caché marcada obsoleta'],['cached_unavailable','Caché sin disponibilidad confirmada'],['no_cached_file','Sin archivo válido en caché'],['not_collected','Sin foto recolectada'],['invalid_snapshot','Registro inválido'],['validation_errors','Comprobación no disponible']];
 return `<p class="muted">${count('inspected_targets')} de ${count('total_targets')} destinos de contactos inspeccionados${data.partial?' · muestra parcial':''}. Un mismo contacto puede tener identificadores distintos.</p><div class="grid columns">${rows.map(([key,label])=>`<div class="kv"><span>${label}</span><strong>${count(key)}</strong></div>`).join('')}</div><p class="muted">Comprobación local: ${esc(data.checked_at?fmt(data.checked_at):'fecha no disponible')}. El resumen puede conservarse hasta 30 segundos.</p><p class="muted">La caché se comprueba por ubicación, existencia, tamaño y tipo declarado. No confirma la firma del archivo, que la foto siga vigente en WhatsApp ni recepción reciente. Consultar este resumen no solicita nuevas fotos.</p>`;
}
const overviewBeforeContactAvatars=overview;
overview=async function(){
 const epoch=viewEpoch;
 await overviewBeforeContactAvatars();
 if(state.page!=='overview'||epoch!==viewEpoch)return;
 let section=document.getElementById('contact-avatar-summary');
 if(section)return;
 section=document.createElement('section');section.id='contact-avatar-summary';section.className='card spaced';
 section.innerHTML='<header class="card-head"><div><h2>Fotos de contactos guardadas</h2><p>Disponibilidad de la caché de esta instancia.</p></div><button class="btn" data-avatar-summary-refresh>Consultar resumen</button></header><div class="card-body" data-avatar-summary-result aria-live="polite">Consultá el resumen para comprobar los archivos locales. No inicia lecturas de WhatsApp.</div>';
 const anchor=document.getElementById('overview-observability')||document.querySelector('#content .grid.stats');
 if(!anchor)return;
 anchor.after(section);
 const button=section.querySelector('[data-avatar-summary-refresh]'),result=section.querySelector('[data-avatar-summary-result]');
 let busy=false;
 button.onclick=async()=>{
  if(busy||!section.isConnected||state.page!=='overview'||epoch!==viewEpoch)return;
  busy=true;button.disabled=true;result.textContent='Comprobando caché local…';
  try{
   const data=await api('/api/v1/contact-avatar-coverage');
   if(section.isConnected&&state.page==='overview'&&epoch===viewEpoch)result.innerHTML=contactAvatarSummaryHtml(data);
  }catch{
   if(section.isConnected&&state.page==='overview'&&epoch===viewEpoch)result.textContent='No se pudo consultar el resumen. Volvé a intentar con el botón.';
  }finally{busy=false;button.disabled=false;}
 };
};
