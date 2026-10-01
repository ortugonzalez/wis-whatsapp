'use strict';
(()=>{
 const root=document.getElementById('app');if(!root)return;let inFlight=false;
 const display=async()=>{
  const box=root.querySelector('.login-box');if(!box||inFlight)return;inFlight=true;
  let status=box.querySelector('[data-local-connection-status]');
  if(!status){status=document.createElement('div');status.className='notice info';status.dataset.localConnectionStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(status);}
  try{
   const response=await fetch('/api/local-status',{cache:'no-store'});if(!response.ok)throw Error('status_unavailable');
   if(!box.isConnected||root.querySelector('.login-box')!==box)return;
   const result=await response.json(),state=result?.data?.status,error=result?.data?.error,last=result?.data?.last_disconnect;
   const replaced=last?.reason==='connection_replaced'&&state!=='connected'&&['reconnecting','reconnect_exhausted'].includes(error);
   const closeInfo=last?.reason?` Último cierre observado: ${last.reason}${Number.isInteger(last.status_code)?` (${last.status_code})`:''}.`:'';
   const replacementHelp=replaced?' WhatsApp reemplazó esta conexión. Revisá Dispositivos vinculados y asegurá que sólo un proceso use esta sesión antes de volver a vincular.':'';
   const separateInstanceHelp='Una conexión activa en otra instalación de WIS no se transfiere a este panel; cada instalación necesita su propia sesión.';
   const message=state==='connected'?'WhatsApp conectado en este panel.':error==='reconnecting'?`WhatsApp reconectando.${closeInfo}${replacementHelp}`:error==='reconnect_exhausted'?`WhatsApp desconectado; la reconexión está pausada.${closeInfo}${replacementHelp} Ingresá para revisar. ${separateInstanceHelp}`:error==='session_revoked'?'WhatsApp rechazó las credenciales guardadas. Todavía no hay un QR nuevo; hace falta una recuperación controlada antes de volver a vincular.':state==='qr_pending'?(replaced?`La reconexión de WhatsApp está inestable.${closeInfo}${replacementHelp}`:'Este panel espera el escaneo de su QR. Ingresá para verlo.'):state==='disconnected'?`WhatsApp desconectado.${closeInfo}${replacementHelp} ${separateInstanceHelp}`:'No se pudo verificar la conexión de WhatsApp.';
   if(status.textContent!==message)status.textContent=message;
  }catch{if(box.isConnected&&root.querySelector('.login-box')===box&&status.textContent!=='Estado de WhatsApp no disponible.')status.textContent='Estado de WhatsApp no disponible.';}
  finally{inFlight=false;const current=root.querySelector('.login-box');if(current&&current!==box)void display();}
 };
 const observer=new MutationObserver(()=>void display());observer.observe(root,{childList:true});
 void display();setInterval(()=>void display(),15000);
})();
