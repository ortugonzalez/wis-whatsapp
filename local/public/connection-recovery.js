(() => {
 let recoveryMode=false;
 const toast=(message)=>{const item=document.getElementById('toast');if(!item)return;item.textContent=message;item.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>item.classList.remove('show'),5000);};
 async function refresh(){
  const button=document.getElementById('connect');
  const note=document.getElementById('identity-state');
  if(!button)return;
  try{
   const response=await fetch('/api/whatsapp/connection',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)return;
   const envelope=await response.json(),connection=envelope.data??envelope;
   recoveryMode=connection.status==='disconnected'&&connection.last_error==='session_revoked';
   const pending=connection.command==='recover';
   const label=recoveryMode?'Preparar nuevo QR':pending?'Preparando nuevo QR…':'Solicitar conexión / QR';
   if(button.textContent.trim()!==label)button.textContent=label;
   button.disabled=connection.status==='connected'||pending;
   button.setAttribute('aria-label',label);
   if(note){
    let help=note.querySelector('[data-session-recovery-help]');
    if(recoveryMode&&!help){help=document.createElement('div');help.className='notice info';help.dataset.sessionRecoveryHelp='true';help.textContent='Al preparar el QR, las credenciales rechazadas se moverán a una copia privada y se iniciará una sesión nueva.';note.append(help);}
    if(!recoveryMode)help?.remove();
   }
  }catch{}
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('#connect');
  if(!button||!recoveryMode)return;
  event.preventDefault();event.stopImmediatePropagation();recoveryMode=false;
  button.disabled=true;button.textContent='Preparando nuevo QR…';
  try{
   const response=await fetch('/api/whatsapp/recover',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
   const envelope=await response.json();
   if(!response.ok)throw new Error(envelope.error||'recovery_unavailable');
   toast('Recuperación iniciada. Se conservará una copia privada antes de solicitar el QR.');
   await refresh();
  }catch(error){
   button.disabled=false;button.textContent='Preparar nuevo QR';
   toast(error.message==='session_recovery_not_available'?'El estado cambió. Actualizando la conexión.':'No se pudo iniciar la recuperación. Actualizá el panel e intentá de nuevo.');
  }
 },true);
 document.addEventListener('DOMContentLoaded',()=>{void refresh();setInterval(()=>void refresh(),1000);});
})();
