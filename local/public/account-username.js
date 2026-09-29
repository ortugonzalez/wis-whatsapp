'use strict';
let usernameObserver=null;
function stopUsernameObserver(){usernameObserver?.disconnect();usernameObserver=null;}
const navigateBeforeUsername=navigate;
navigate=async function(...args){stopUsernameObserver();return navigateBeforeUsername(...args);};
const loginBeforeUsername=login;
login=function(...args){stopUsernameObserver();return loginBeforeUsername(...args);};
const accountBeforeUsername=accountPage;
accountPage=async function(){
 const epoch=viewEpoch;
 await accountBeforeUsername();
 if(epoch!==viewEpoch||state.page!=='account')return;
 const host=document.getElementById('account-info');
 if(!host)return;
 const card=document.createElement('section');
 card.className='card spaced';
 card.innerHTML='<header class="card-head"><div><h2>Username de la cuenta</h2><p data-username-date>Consultando…</p></div><button class="btn" data-username-refresh>Actualizar username</button></header><div class="card-body"><div data-username-fields></div><p class="field-note">Consulta de solo lectura mediante USync para la identidad propia. Solo se conserva una respuesta asociada exactamente a la cuenta conectada; si no llega una coincidencia, queda como no verificada.</p></div>';
 let refreshing=false;
 const refresh=async()=>{
  if(refreshing||epoch!==viewEpoch||state.page!=='account')return;
  refreshing=true;
  try{
   const account=await api('/api/v1/account');
   if(epoch!==viewEpoch||state.page!=='account')return;
   const value=account.username;
   const data=value?.data;
   card.querySelector('[data-username-date]').textContent=value?.updated_at?'Consultado '+fmt(value.updated_at):'Sin consulta registrada';
   const output=card.querySelector('[data-username-fields]');output.replaceChildren();
   if(data?.response_verified===true&&typeof data.username==='string')output.innerHTML=fields({username:data.username});
   else{const note=document.createElement('p');note.className='snapshot-empty';note.textContent=typeof data?.username==='string'&&data.stale===true?`Último username verificado: ${data.username} (desactualizado).`:data?.error==='no_exact_username_reply'?'WhatsApp no devolvió un username que pudiera asociarse exactamente con esta cuenta. El dato sigue desconocido.':data?.error==='read_timeout'?'La consulta superó el tiempo de espera. El username sigue desconocido.':'Todavía no se recibió una respuesta verificable.';output.append(note);}
  }finally{refreshing=false;}
 };
 card.querySelector('[data-username-refresh]').onclick=async event=>{
  const button=event.currentTarget;
  button.disabled=true;
  try{await syncReadOnly('account_username');}
  catch(error){showError(error.message);}
  finally{button.disabled=false;}
 };
 host.prepend(card);
 usernameObserver=new MutationObserver(()=>{
  if(epoch!==viewEpoch||state.page!=='account'||!host.isConnected){stopUsernameObserver();return;}
  if(!card.isConnected){host.prepend(card);void refresh();}
 });
 usernameObserver.observe(host,{childList:true});
 await refresh();
};
