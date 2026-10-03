// Aggregate only; identifiers never leave this function.
export function buildUnambiguousIdentityCoverage(db) {
 const rows=[],owners=new Map(),pnPattern=/^[1-9]\d{7,14}@s\.whatsapp\.net$/;
 for(const row of db.prepare("SELECT resource_id,payload,updated_at FROM snapshots WHERE kind='identity'").iterate()){
  let data;try{data=JSON.parse(row.payload);}catch{continue;}
  if(!data||!/^\d{1,30}@lid$/.test(row.resource_id)||data.lid!==row.resource_id)continue;
  const candidates=new Set([data.pn,data.conflicting_pn,...(Array.isArray(data.candidate_pns)?data.candidate_pns:[])].filter(pn=>typeof pn==='string'&&pnPattern.test(pn)));
  for(const pn of candidates){if(!owners.has(pn))owners.set(pn,new Set());owners.get(pn).add(row.resource_id);}
  rows.push({data:{pn:data.pn,conflict:data.conflict,status:data.status,source:data.source,stale:data.stale},candidateCount:candidates.size,updated_at:row.updated_at});
 }
 let records=0,stale=0,updated=null;
 for(const {data,candidateCount,updated_at} of rows){
  if(data.conflict!==false||data.status!=='observed'||!['contacts','messaging-history.set','lid-mapping.update'].includes(data.source)||!pnPattern.test(data.pn)||candidateCount!==1||owners.get(data.pn)?.size!==1)continue;
  records++;if(data.stale===true)stale++;
  if(typeof updated_at==='string'&&Number.isFinite(Date.parse(updated_at))&&(!updated||Date.parse(updated_at)>Date.parse(updated)))updated=updated_at;
 }
 return {kind:'unambiguous_identity',records,field_counts:['lid','pn'].map(field=>({field,records,non_empty_text_records:records,stale_records:stale,stale_non_empty_text_records:stale,snapshot_updated_at:updated}))};
}
