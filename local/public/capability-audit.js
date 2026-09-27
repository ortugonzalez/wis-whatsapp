const capabilityAuditLabels={candidate:'Equivalente candidato',local_only:'Responsabilidad local',no_public_method_found:'Sin método público identificado'};
const capabilitiesBeforeAudit=capabilities;
capabilities=async function(){
 const epoch=viewEpoch;
 await capabilitiesBeforeAudit();
 if(epoch!==viewEpoch)return;
 const result=await api('/api/v1/capabilities');
 if(epoch!==viewEpoch)return;
 const rows=Array.isArray(result)?result:result.capabilities||[];
 const audited=rows.filter(row=>row.baileys_audit);
 const section=document.createElement('section');section.className='card spaced';
 section.innerHTML=`<header class="card-head"><div><h2>Viabilidad técnica en Baileys</h2><p>${audited.length} métodos revisados. Un equivalente candidato no demuestra implementación ni paridad.</p></div></header><div class="card-body"><input class="search" aria-label="Buscar auditoría técnica" placeholder="Buscar función o método de Baileys"><div class="audit-results"></div></div>`;
 document.querySelector('#cap-table').before(section);
 const input=section.querySelector('input'),target=section.querySelector('.audit-results');
 const draw=()=>{const q=input.value.toLowerCase();const filtered=audited.filter(row=>[row.id,row.name,row.baileys_audit.reason,...row.baileys_audit.methods.map(m=>m.name)].join(' ').toLowerCase().includes(q));
 target.innerHTML=table(['Función','Viabilidad','Evidencia y próximo paso'],filtered.map(row=>{const a=row.baileys_audit;return [esc(row.id),esc(capabilityAuditLabels[a.support]||a.support),`<details><summary>Ver análisis · ${esc(a.version)}</summary><p>${esc(a.reason)}</p>${a.methods.map(m=>`<p><code>${esc(m.name)}</code> · <small>${esc(m.file)}</small></p>`).join('')}<p><strong>Falta:</strong> ${esc(a.next_step)}</p></details>`];}),'No hay coincidencias');};
 input.oninput=draw;draw();
};
