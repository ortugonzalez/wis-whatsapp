'use strict';
const conversationDetailsBeforeDisappearingMode=conversationDetails;
conversationDetails=async function(id){
 await conversationDetailsBeforeDisappearingMode(id);
 const drawer=document.querySelector('.detail-drawer');
 const stillCurrent=()=>drawer?.isConnected&&drawer.open===true&&drawer.dataset.conversationId===id&&document.querySelector('.detail-drawer')===drawer;
 if(!stillCurrent())return;
 try{
  const detail=await api('/api/v1/conversations?id='+encodeURIComponent(id));
  if(!stillCurrent())return;
  const chat=detail.conversation||{},target=chat.wa_chat_id||'';
  const known=/^\d+(?:-\d+)?@(s\.whatsapp\.net|lid|g\.us)$/.test(target);
  const snapshot=detail.snapshots?.find(item=>item.kind==='disappearing_mode')?.data||null;
  const modeState=known?await api('/api/v1/disappearing-mode?target='+encodeURIComponent(target)):{command:null};
  if(!stillCurrent())return;
  const command=modeState.command||null;
  const connection=await api('/api/whatsapp/connection');
  if(!stillCurrent())return;
  const connected=connection.status==='connected'&&connection.identity_verified===true;
  const pending=['pending','running'].includes(command?.status);
  const display=snapshot?.available===true
   ? `${Number(snapshot.duration_seconds)} segundos${snapshot.set_at?` · fecha informada ${fmt(snapshot.set_at)}`:''}`
   : snapshot?.stale===true?'La última observación está desactualizada.'
   : command?.status==='failed'?`La última consulta falló: ${esc(command.error||'read_failed')}`
   : pending?'Hay una consulta pendiente del worker local.'
   : 'Todavía no hay una observación válida.';
  const section=document.createElement('section');section.className='detail-section';
  section.innerHTML=`<header><h3>Modo de expiración informado para este JID</h3>${badge(snapshot?.stale?'Desactualizado':snapshot?.available?'Observado':'Sin dato','gray')}</header>${kv('Duración reportada (segundos)',snapshot?.available===true?snapshot.duration_seconds:'No disponible')}${kv('Fecha informada por WhatsApp',snapshot?.available===true&&snapshot.set_at?fmt(snapshot.set_at):'No informada')}${kv('Observado localmente',snapshot?.observed_at?fmt(snapshot.observed_at):'No disponible')}<p class="detail-hint">${esc(display)} La respuesta de Baileys describe el modo asociado al JID; no demuestra por sí sola la configuración efectiva del chat ni se equipara al campo ephemeral de WHAPI.</p><button class="btn" data-read-disappearing ${!known||!connected||pending?'disabled':''}>${!known?'No disponible para este tipo de chat':pending?'Consulta pendiente':connected?'Consultar en WhatsApp':'Worker local desconectado o identidad sin verificar'}</button>`;
  drawer.querySelector('.drawer-body')?.append(section);
  const button=section.querySelector('[data-read-disappearing]');
  button?.addEventListener('click',async()=>{
   if(!stillCurrent())return;
   button.disabled=true;button.textContent='Esperando respuesta de WhatsApp…';
   try{
    const queued=await api('/api/v1/sync','POST',{kind:'disappearing_mode',target});
    if(!stillCurrent())return;
    for(let attempt=0;attempt<30;attempt++){
     const current=await api('/api/v1/sync?id='+encodeURIComponent(queued.id));
     if(!stillCurrent())return;
     if(current.status==='done'){drawer.close();drawer.remove();toast('Lectura terminada. Se actualizó el detalle local.');void conversationDetails(id);return;}
     if(current.status==='failed')throw new Error(current.error||'read_failed');
     await new Promise(resolve=>setTimeout(resolve,500));
     if(!stillCurrent())return;
    }
    if(!stillCurrent())return;
    button.textContent='La consulta sigue pendiente. Actualizá el detalle más tarde.';
   }catch(error){if(!stillCurrent())return;button.disabled=false;button.textContent='Reintentar consulta';showError(errorCopy[error.message]||error.message);}
  });
 }catch(error){if(stillCurrent())showError(error.message);}
};
