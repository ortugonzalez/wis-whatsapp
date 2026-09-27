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
  const entityLabels={contacts:'Contactos',conversations:'Conversaciones',groups:'Grupos',identity_observations:'Observaciones de identidad',messages:'Mensajes'};
  const entityRows=Object.entries(coverage.entities||{}).map(([name,row])=>[esc(entityLabels[name]||name),row.known??row.stored??0,row.with_whatsapp_id??'—',row.metadata_records??row.chat_metadata_records??'—']);
  const readRows=(coverage.read_commands||[]).map(row=>[esc(row.kind),esc(({pending:'Encolada',running:'En curso',done:'Completada',failed:'Fallida'})[row.status]||row.status),row.count,esc(row.last_updated_at?fmt(row.last_updated_at):'—')]);
  const readErrorLabels={read_timeout:'Tiempo de espera agotado',read_pending:'Otra lectura sigue sin resolverse',disconnected:'Conexión no disponible',method_missing:'Consulta no disponible',identity_unavailable:'No se pudo verificar la identidad',invalid_target:'Destino de lectura inválido',unknown_target:'Recurso no encontrado',not_found:'Recurso no encontrado',order_message_unavailable:'No se encontró el pedido asociado',order_credential_unavailable:'Credencial del pedido no disponible',public_catalog_unavailable:'Catálogo público no disponible',graphql_error:'Error en la consulta del catálogo público',access_denied:'Acceso denegado por WhatsApp',rate_limited:'Límite remoto alcanzado',transport_failed:'Fallo de transporte',public_catalog_config_unavailable:'Lector del catálogo no configurado',provider_error:'WhatsApp devolvió un error',worker_interrupted:'Worker interrumpido durante la lectura',read_unavailable_or_disconnected:'La lectura no estuvo disponible o se perdió la conexión',read_failed:'Fallo de lectura'};
  const readErrorRows=(coverage.read_errors||[]).map(row=>[esc(row.kind),esc(readErrorLabels[row.code]||'Fallo de lectura'),esc(row.code),row.count,esc(row.last_updated_at?fmt(row.last_updated_at):'—')]);
  if(coverage.read_errors_truncated)readErrorRows.push(['—','Listado limitado; existen más grupos de error','truncado','—','—']);
  const observedFields=(coverage.snapshot_kinds||[]).flatMap(row=>(row.field_counts||[]).map(item=>({kind:row.kind,total:row.records,field:item.field,records:item.records,updated:item.snapshot_updated_at}))).sort((a,b)=>a.kind.localeCompare(b.kind)||a.field.localeCompare(b.field));
  const truncatedKinds=(coverage.snapshot_kinds||[]).filter(row=>row.omitted_fields||row.field_inventory_truncated);
  const omittedFields=truncatedKinds.reduce((sum,row)=>sum+(Number(row.omitted_fields)||0),0);
  const truncationNote=truncatedKinds.length?`Inventario parcial: ${omittedFields} nombres de campo omitidos en ${truncatedKinds.length} tipos de dato (${truncatedKinds.map(row=>esc(row.kind)).join(', ')}). Se aplicaron límites de seguridad.`:'El listado muestra solo los nombres de campo observados y está sujeto a límites de seguridad.';
  section.innerHTML=`<header class="card-head"><div><h2>Cobertura de datos observados</h2><p>Conteos locales y frecuencia de cada campo; los valores privados siguen protegidos.</p></div><button class="btn hidden" data-coverage-sync>Actualizar lecturas disponibles</button></header><p class="small muted" data-coverage-sync-feedback>Consulta secuencial de cuenta/grupos, bloqueos, comunidades, catálogo, colecciones y canales ya conocidos. Solo lectura, con límites por recurso.</p>${table(['Recurso','Conocidos','Con ID WhatsApp','Metadatos'],entityRows)}${table(['Lectura','Estado','Cantidad','Último cambio'],readRows,'Todavía no se iniciaron lecturas remotas')}${table(['Lectura fallida','Diagnóstico','Código sanitizado','Cantidad','Último cambio'],readErrorRows,'No hay lecturas fallidas registradas')}<section class="spaced"><header class="card-head"><div><h3>Variables observadas</h3><p>Campos recibidos en los snapshots locales. Los valores privados no se muestran aquí.</p></div></header><div class="filter-row"><input class="search" type="search" data-observed-field-search placeholder="Buscar tipo de dato o campo…" aria-label="Buscar variables observadas"><span class="small muted" data-observed-field-count></span></div><p class="small muted" data-observed-field-limit>${truncationNote}</p><div data-observed-field-table></div></section><p class="small muted">Los mensajes e historiales pueden ser parciales. Un campo ausente significa que no está presente en el snapshot conservado. La actividad de lectura se agrupa sin mostrar destinos ni identificadores.</p>`;
  const fieldSearch=section.querySelector('[data-observed-field-search]'),fieldCount=section.querySelector('[data-observed-field-count]'),fieldTable=section.querySelector('[data-observed-field-table]');
  const currentFieldSearch=previous?.querySelector('[data-observed-field-search]');
  const currentFieldQuery=currentFieldSearch?.value||'';
  const currentFieldHadFocus=document.activeElement===currentFieldSearch;
  const currentFieldCursor=currentFieldSearch?.selectionStart;
  fieldSearch.value=currentFieldQuery;
  const renderObservedFields=()=>{const query=fieldSearch.value.trim().toLocaleLowerCase('es');const matches=observedFields.filter(item=>!query||`${item.kind} ${item.field}`.toLocaleLowerCase('es').includes(query));fieldCount.textContent=`${matches.length} de ${observedFields.length} campos observados`;fieldTable.innerHTML=table(['Tipo de dato','Campo','Registros con campo','Registros totales','Última actualización del snapshot'],matches.map(item=>[esc(item.kind),`<code>${esc(item.field)}</code>`,item.records,item.total,esc(item.updated?fmt(item.updated):'—')]),'No se encontraron campos para esta búsqueda');};
  fieldSearch.addEventListener('input',renderObservedFields);renderObservedFields();
  if(previous?.isConnected)previous.replaceWith(section);else anchor.insertAdjacentElement('afterend',section);
  if(currentFieldHadFocus){fieldSearch.focus({preventScroll:true});const cursor=Math.min(currentFieldCursor??currentFieldQuery.length,fieldSearch.value.length);fieldSearch.setSelectionRange(cursor,cursor);}
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
