let dataCoverageRequest=0;
let coverageSyncPromise=null;
let coverageSyncFeedback='';
const coverageReadKinds=['all','blocklist','communities','catalog','collections','newsletters'];
function setCoverageSyncFeedback(value){coverageSyncFeedback=value;const output=document.querySelector('[data-coverage-sync-feedback]');if(output)output.textContent=value;}
async function refreshObservedData(feedback){
 if(coverageSyncPromise)return coverageSyncPromise;
 coverageSyncPromise=(async()=>{
  const failed=[];let completed=0,attempted=0;
  try{
   for(const kind of coverageReadKinds){
    if(state.page!=='overview'){failed.push('panel cerrado; secuencia detenida');break;}
    attempted++;setCoverageSyncFeedback(`Consultando ${kind} (${attempted}/${coverageReadKinds.length})…`);
    const command=await api('/api/v1/sync','POST',{kind},{timeoutMs:5000});let result=command;
    const deadline=Date.now()+90000;
    while(['pending','running'].includes(result.status)&&Date.now()<deadline){
     await new Promise(resolve=>setTimeout(resolve,2000));
     result=await api(`/api/v1/sync?id=${encodeURIComponent(command.id)}`,'GET',undefined,{timeoutMs:5000});
    }
    if(result.status!=='done')failed.push(`${kind}: ${result.status==='failed'?result.error||'falló':'sigue en curso; secuencia detenida'}`);
    if(['pending','running'].includes(result.status))break;
    if(result.status==='done')completed++;
   }
   setCoverageSyncFeedback(failed.length?`Respuestas correctas: ${completed}/${coverageReadKinds.length}; pasos iniciados: ${attempted}. ${failed.join(' · ')}`:`Lecturas correctas: ${completed}/${coverageReadKinds.length}. Actualizando cobertura local…`);
   const coverageUpdated=await insertDataCoverage(viewEpoch);
   setCoverageSyncFeedback(failed.length?`Respuestas correctas: ${completed}/${coverageReadKinds.length}; pasos iniciados: ${attempted}. ${failed.join(' · ')}${coverageUpdated?'':' · No se pudo actualizar la vista local'}`:`Lecturas correctas: ${completed}/${coverageReadKinds.length}.${coverageUpdated?' Los datos visibles se actualizaron.':' La lectura local de cobertura falló.'}`);
  }catch(error){setCoverageSyncFeedback(`La secuencia se detuvo: ${error.message}. Las lecturas completadas se conservan.`);}
  finally{coverageSyncPromise=null;const button=document.querySelector('[data-coverage-sync]');if(button)button.disabled=false;}
  if(feedback?.isConnected)feedback.textContent=coverageSyncFeedback;
 })();
 return coverageSyncPromise;
}
async function insertDataCoverage(epoch=viewEpoch){
 const anchor=document.querySelector('.stats');if(state.page!=='overview'||!anchor)return false;
 const request=++dataCoverageRequest;
 const previous=document.getElementById('data-coverage');
 try{
  const coverage=await api('/api/v1/coverage','GET',undefined,{timeoutMs:5000});
  if(state.page!=='overview'||epoch!==viewEpoch||request!==dataCoverageRequest||anchor!==document.querySelector('.stats'))return;
  const section=document.createElement('section');section.id='data-coverage';section.className='card spaced';
  const entityRows=Object.entries(coverage.entities||{}).map(([name,row])=>[esc(name),row.known??row.stored??0,row.with_whatsapp_id??'—',row.metadata_records??row.chat_metadata_records??'—']);
  const fieldRows=(coverage.snapshot_kinds||[]).map(row=>{const fields=(row.field_counts||[]).map(item=>`${item.field} (${item.records}/${row.records}; snapshot actualizado ${item.snapshot_updated_at?fmt(item.snapshot_updated_at):'sin fecha'})`).join(', ')||(row.fields||[]).join(', ')||'Sin campos observados';return [esc(row.kind),row.records,esc(row.last_updated_at?fmt(row.last_updated_at):'—'),esc(fields+(row.omitted_fields?` · ${row.omitted_fields} nombres omitidos por límite`:'' )+(row.field_inventory_truncated?' · inventario de campos limitado':''))];});
  section.innerHTML=`<header class="card-head"><div><h2>Cobertura de datos observados</h2><p>Conteos locales y frecuencia de cada campo; los valores privados siguen protegidos.</p></div><button class="btn hidden" data-coverage-sync>Actualizar lecturas disponibles</button></header><p class="small muted" data-coverage-sync-feedback>Consulta secuencial de cuenta/grupos, bloqueos, comunidades, catálogo, colecciones y canales ya conocidos. Solo lectura, con límites por recurso.</p>${table(['Recurso','Conocidos','Con ID WhatsApp','Metadatos'],entityRows)}${table(['Tipo de dato','Registros','Última observación','Campos observados (registros con campo / total)'],fieldRows,'Todavía no hay campos observados')}<p class="small muted">Los mensajes e historiales pueden ser parciales. Un campo ausente significa que no fue observado en esta sesión.</p>`;
  if(previous?.isConnected)previous.replaceWith(section);else anchor.insertAdjacentElement('afterend',section);
  const syncButton=section.querySelector('[data-coverage-sync]');syncButton.disabled=Boolean(coverageSyncPromise);syncButton.onclick=()=>void refreshObservedData(section.querySelector('[data-coverage-sync-feedback]'));
  if(coverageSyncFeedback)section.querySelector('[data-coverage-sync-feedback]').textContent=coverageSyncFeedback;
  try{const session=await api('/api/session','GET',undefined,{timeoutMs:5000});if(session.admin&&syncButton.isConnected)syncButton.classList.remove('hidden');}catch{}
  if(state.page==='overview'&&epoch===viewEpoch){clearInterval(state.dataCoverageTimer);state.dataCoverageTimer=setInterval(()=>{if(state.page==='overview')void insertDataCoverage(viewEpoch);},15000);}
  return true;
 }catch(error){if(epoch===viewEpoch&&state.page==='overview')showError(error.message);return false;}
}
const overviewBeforeDataCoverage=overview;
overview=async function(){const epoch=viewEpoch;await overviewBeforeDataCoverage();if(epoch===viewEpoch)await insertDataCoverage(epoch);};
const navigateBeforeDataCoverage=navigate;
navigate=async function(...args){clearInterval(state.dataCoverageTimer);state.dataCoverageTimer=null;dataCoverageRequest++;return navigateBeforeDataCoverage(...args);};
const loginBeforeDataCoverage=login;
login=function(...args){clearInterval(state.dataCoverageTimer);state.dataCoverageTimer=null;dataCoverageRequest++;return loginBeforeDataCoverage(...args);};
let coverageBootAttempts=0;
function bootDataCoverage(){if(state.page==='overview'&&document.querySelector('.stats')){void insertDataCoverage(viewEpoch);return;}if(++coverageBootAttempts<80)setTimeout(bootDataCoverage,125);}
setTimeout(bootDataCoverage,0);
