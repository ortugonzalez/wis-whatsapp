const fields={
  quota:['total_quota','used_quota','cycle_start_timestamp','cycle_end_timestamp','server_sent_timestamp','capping_status','mv_status','ote_status'],
  timelock:['is_active','time_enforcement_ends','enforcement_type'],
};

function validTimestamp(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}

export function mergeAccountLimitsSnapshot(previous={},results={},observedAt=new Date().toISOString()){
  const at=validTimestamp(observedAt);
  if(!at)throw new Error('invalid_observed_at');
  const sections={};
  for(const kind of Object.keys(fields)){
    const prior=previous[kind]||{},result=results[kind]||{};
    const verified=result.available===true&&result.response_verified===true;
    const priorSuccess=validTimestamp(prior.last_success_at)||(prior.response_verified===true?validTimestamp(previous.observed_at):null);
    const historical=Object.fromEntries(fields[kind].filter(key=>prior[key]!==undefined).map(key=>[key,prior[key]]));
    sections[kind]=verified
      ? {...Object.fromEntries(fields[kind].filter(key=>result[key]!==undefined).map(key=>[key,result[key]])),available:true,response_verified:true,stale:false,error:null,status_code:null,last_attempt_at:at,last_success_at:at}
      : {...historical,available:prior.available===true&&priorSuccess!==null,response_verified:false,stale:priorSuccess!==null,error:typeof result.error==='string'?result.error:'invalid_response',status_code:Number.isInteger(result.status_code)?result.status_code:null,last_attempt_at:at,last_success_at:priorSuccess};
  }
  const current=Object.values(sections).some(section=>section.response_verified===true);
  const anyHistorical=Object.values(sections).some(section=>section.last_success_at!==null);
  return {...sections,available:current,response_verified:current,stale:!current&&anyHistorical,partial:!sections.quota.response_verified||!sections.timelock.response_verified,observed_at:at};
}
