let contactCheckResults=new Map(),contactCheckObserver=null;
const contactsBeforeChecks=contacts;
function contactCheckLabel(result){const value=result?.data?.status??result?.status;return ({registered:'Registrado en WhatsApp',not_registered:'No registrado · respuesta explícita',unknown:'Sin resultado confirmado',unavailable:'No disponible'})[value]||'Sin consultar';}
function decorateContactChecks(){
 const tableRoot=document.getElementById('contacts-table');if(!tableRoot||state.page!=='contacts')return;
 for(const edit of tableRoot.querySelectorAll('[data-edit-contact]')){
  const id=edit.dataset.editContact,contact=state.contacts.find(row=>row.id===id),cell=edit.closest('td');if(!contact||!cell)continue;
  let status=cell.querySelector('[data-contact-check-status]');if(!status){status=document.createElement('span');status.dataset.contactCheckStatus='';status.className='small muted';cell.insertBefore(status,edit);}
  if(!cell.querySelector('[data-check-contact]:disabled')){const label=contactCheckLabel(contactCheckResults.get(id));if(status.textContent!==label)status.textContent=label;}
  if(!contact.phone_e164)continue;
  let button=cell.querySelector('[data-check-contact]');if(!button){button=document.createElement('button');button.type='button';button.className='subtle';button.dataset.checkContact=id;button.textContent='Verificar en WhatsApp';cell.insertBefore(button,edit);}
 }
}
contacts=async function(...args){
 if(contactCheckObserver){contactCheckObserver.disconnect();contactCheckObserver=null;}
 await contactsBeforeChecks(...args);if(state.page!=='contacts')return;
 const epoch=viewEpoch;
 try{const result=await api('/api/v1/contact-checks');if(epoch!==viewEpoch||state.page!=='contacts')return;contactCheckResults=new Map(result.map(row=>[row.contact_id,row]));decorateContactChecks();const root=document.getElementById('contacts-table');if(root){contactCheckObserver=new MutationObserver(decorateContactChecks);contactCheckObserver.observe(root,{childList:true,subtree:true});}}
 catch(error){if(epoch===viewEpoch)showError(error.message);}
};
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-check-contact]');if(!button)return;
 event.preventDefault();const id=button.dataset.checkContact,cell=button.closest('td'),status=cell?.querySelector('[data-contact-check-status]');let feedback=cell?.querySelector('[data-contact-check-feedback]');if(cell&&!feedback){feedback=document.createElement('span');feedback.dataset.contactCheckFeedback='';feedback.className='small muted';cell.insertBefore(feedback,button);}button.disabled=true;if(feedback)feedback.textContent='Consulta manual en curso…';
 try{
  const queued=await api('/api/v1/sync','POST',{kind:'contact_check',target:id}),until=Date.now()+30000;
  while(Date.now()<until&&button.isConnected){await new Promise(resolve=>setTimeout(resolve,750));const current=await api(`/api/v1/contact-checks?id=${encodeURIComponent(id)}`);if(current.command?.id!==queued.id)continue;if(current.command.status==='failed'){if(current.result)contactCheckResults.set(id,current.result);if(feedback)feedback.textContent='No se pudo consultar; revisá el estado de la conexión.';return;}if(current.command.status==='done'&&current.result&&Date.parse(current.result.updated_at||'')>=Date.parse(queued.created_at)){contactCheckResults.set(id,current.result);if(status)status.textContent=contactCheckLabel(current.result);if(feedback)feedback.textContent='';return;}}
  if(feedback)feedback.textContent='La respuesta sigue pendiente; no se infiere que el número esté fuera de WhatsApp.';
 }catch(error){if(feedback)feedback.textContent=error.message;}
 finally{if(button.isConnected)button.disabled=false;}
});
