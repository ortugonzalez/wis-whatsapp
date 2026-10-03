'use strict';
function groupInviteMetadataCard(){
 const section=document.createElement('section');section.className='detail-section';section.dataset.groupInviteInfo='';
 section.innerHTML='<header><h3>Metadatos desde un código de invitación</h3></header><p class="detail-hint">Consulta administrativa de solo lectura. El código se envía a la API local en memoria y no se conserva en SQLite.</p><label for="group-invite-info-code">Código de invitación</label><div style="display:flex;gap:8px;margin:8px 0"><input id="group-invite-info-code" type="text" maxlength="128" autocomplete="off" spellcheck="false" placeholder="Pegá solo el código" style="flex:1;min-width:0"><button class="btn" data-group-invite-info-lookup>Consultar</button></div><p class="detail-hint" data-group-invite-info-state aria-live="polite"></p><pre data-group-invite-info-result hidden style="max-height:320px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
 const input=section.querySelector('#group-invite-info-code'),button=section.querySelector('[data-group-invite-info-lookup]'),state=section.querySelector('[data-group-invite-info-state]'),output=section.querySelector('[data-group-invite-info-result]');
 button.addEventListener('click',async()=>{
  const inviteCode=input.value.trim();output.hidden=true;output.textContent='';
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(inviteCode)){state.textContent='Ingresá únicamente el código, sin la URL de invitación.';input.value='';return;}
  button.disabled=true;state.textContent='Consultando WhatsApp…';
  try{const response=await api('/api/v1/group-invite-info','POST',{invite_code:inviteCode});if(!section.isConnected)return;output.textContent=JSON.stringify(response.data,null,2);output.hidden=false;state.textContent=`Respuesta recibida · ${response.meta.observed_at} · Participantes informados ${response.data.participants?.length??0}${response.meta.participants_truncated?' (lista recortada)':''}.${response.meta.participants_projection_complete===true?'':' Hay datos de participantes incompletos o descartados; no se infieren roles faltantes.'} La respuesta no garantiza la lista completa del grupo.`;
  }catch{if(section.isConnected)state.textContent='No se pudo consultar. Revisá la conexión y volvé a intentarlo más tarde.';
  }finally{input.value='';button.disabled=false;}
 });
 return section;
}
const groupDetailsBeforeInviteInfo=groupDetails;
groupDetails=async function(id){
 const pending=groupDetailsBeforeInviteInfo(id);await pending;const drawer=document.querySelector('.detail-drawer');if(!drawer?.isConnected||!drawer.querySelector('.detail-actions')||drawer.querySelector('[data-group-invite-info]'))return;
 let session;try{session=await api('/api/session');}catch{return;}if(session.admin)drawer.querySelector('.drawer-body')?.append(groupInviteMetadataCard());
};
