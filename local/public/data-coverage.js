let dataCoverageRequest=0;
async function insertDataCoverage(epoch=viewEpoch){
 const anchor=document.querySelector('.stats');if(state.page!=='overview'||!anchor)return;
 const request=++dataCoverageRequest;
 const previous=document.getElementById('data-coverage');
 try{
  const coverage=await api('/api/v1/coverage');
  if(state.page!=='overview'||epoch!==viewEpoch||request!==dataCoverageRequest||anchor!==document.querySelector('.stats'))return;
  const section=document.createElement('section');section.id='data-coverage';section.className='card spaced';
  const entityRows=Object.entries(coverage.entities||{}).map(([name,row])=>[esc(name),row.known??row.stored??0,row.with_whatsapp_id??'—',row.metadata_records??row.chat_metadata_records??'—']);
  const fieldRows=(coverage.snapshot_kinds||[]).map(row=>{const fields=(row.field_counts||[]).map(item=>`${item.field} (${item.records}/${row.records}; snapshot actualizado ${item.snapshot_updated_at?fmt(item.snapshot_updated_at):'sin fecha'})`).join(', ')||(row.fields||[]).join(', ')||'Sin campos observados';return [esc(row.kind),row.records,esc(row.last_updated_at?fmt(row.last_updated_at):'—'),esc(fields+(row.omitted_fields?` · ${row.omitted_fields} nombres omitidos por límite`:'' )+(row.field_inventory_truncated?' · inventario de campos limitado':''))];});
  section.innerHTML=`<header class="card-head"><div><h2>Cobertura de datos observados</h2><p>Conteos locales y frecuencia de cada campo; los valores privados siguen protegidos.</p></div></header>${table(['Recurso','Conocidos','Con ID WhatsApp','Metadatos'],entityRows)}${table(['Tipo de dato','Registros','Última observación','Campos observados (registros con campo / total)'],fieldRows,'Todavía no hay campos observados')}<p class="small muted">Los mensajes e historiales pueden ser parciales. Un campo ausente significa que no fue observado en esta sesión.</p>`;
  if(previous?.isConnected)previous.replaceWith(section);else anchor.insertAdjacentElement('afterend',section);
  if(state.page==='overview'&&epoch===viewEpoch){clearInterval(state.dataCoverageTimer);state.dataCoverageTimer=setInterval(()=>{if(state.page==='overview')void insertDataCoverage(viewEpoch);},15000);}
 }catch(error){if(epoch===viewEpoch&&state.page==='overview')showError(error.message);}
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
