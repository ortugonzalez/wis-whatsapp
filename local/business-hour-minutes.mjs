// A conservative projection; original provider attributes remain untouched.
const BUSINESS_DAYS=new Set(['sun','mon','tue','wed','thu','fri','sat']);
const BUSINESS_MODES=new Set(['open_24h','specific_hours']);
export function parseBusinessMinute(value, { closing = false } = {}) {
 if (typeof value === 'string') {
  if (!/^\d{1,4}$/.test(value)) return null;
  value = Number(value);
 }
 return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= (closing ? 1440 : 1439) ? value : null;
}

export function projectBusinessHourMinutes(data) {
 const config=data?.business_hours?.config;
 if(!Array.isArray(config))return {rows:[],truncated:false};
 const rows=config.slice(0,28).map(item=>{
  const row={};
  if(!item||typeof item!=='object'||Array.isArray(item))return row;
  if(BUSINESS_DAYS.has(item.day_of_week))row.day=item.day_of_week;
  if(BUSINESS_MODES.has(item.mode))row.mode=item.mode;
  const open=parseBusinessMinute(item.open_time),close=parseBusinessMinute(item.close_time,{closing:true});
  if(open!==null)row.openTime=open;
  if(close!==null)row.closeTime=close;
  return row;
 });
 return {rows,truncated:config.length>28};
}

export function buildBusinessMinuteCoverage(db) {
 const row=db.prepare("SELECT payload,updated_at FROM snapshots WHERE kind='business' AND resource_id='wis-5679'").get();
 const result={kind:'business_minutes',records:0,field_counts:[],truncated:false,row_limit:28};
 if(!row)return result;
 let data;try{data=JSON.parse(row.payload);}catch{return result;}
 const stale=data?.stale===true;
 const previousSuccess=typeof data?.last_success_at==='string'&&Number.isFinite(Date.parse(data.last_success_at));
 if(data?.available!==true&&!(stale&&previousSuccess))return result;
 const projection=projectBusinessHourMinutes(data);
 result.truncated=projection.truncated;
 result.records=1;
 if(Array.isArray(data?.business_hours?.config))result.field_counts.push({field:'hours.config',records:1,stale_records:stale?1:0,snapshot_last_success_at:previousSuccess?data.last_success_at:null,snapshot_updated_at:typeof row.updated_at==='string'&&Number.isFinite(Date.parse(row.updated_at))?row.updated_at:null});
 for(const key of ['openTime','closeTime','day','mode']){
  if(!projection.rows.some(item=>Object.hasOwn(item,key)))continue;
  result.field_counts.push({field:`hours.config[].${key}`,records:1,stale_records:stale?1:0,snapshot_last_success_at:previousSuccess?data.last_success_at:null,snapshot_updated_at:typeof row.updated_at==='string'&&Number.isFinite(Date.parse(row.updated_at))?row.updated_at:null});
 }
 return result;
}
