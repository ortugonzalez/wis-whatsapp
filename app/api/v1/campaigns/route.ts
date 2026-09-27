import {ApiError,body,check,context,endpoint,result,uuid} from '@/lib/api/core';
export const GET=endpoint(async r=>{const c=await context(r,'read',true);const {data,error}=await c.db.from('wis_campaigns').select('*').eq('sector_id',c.sectorId).order('created_at',{ascending:false}).limit(100);check(error);return result(data);});
export const POST=endpoint(async r=>{
 const c=await context(r,'read',true);const b=await body(r);
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||typeof b.body!=='string'||!b.body.trim()||b.body.length>10000)throw new ApiError(400,'invalid_campaign');
 if(!Array.isArray(b.contact_ids)||b.contact_ids.length<1||b.contact_ids.length>1000)throw new ApiError(400,'invalid_recipients');
 const ids=[...new Set(b.contact_ids.map(uuid))];
 if(!Number.isInteger(b.daily_limit)||Number(b.daily_limit)<1||Number(b.daily_limit)>10000)throw new ApiError(400,'explicit_daily_limit_required');
 if(typeof b.window_start!=='string'||typeof b.window_end!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.window_start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.window_end)||b.window_start>=b.window_end)throw new ApiError(400,'invalid_window');
 const {data:contacts,error:readError}=await c.db.from('contacts').select('id').eq('sector_id',c.sectorId).in('id',ids);check(readError);if(contacts?.length!==ids.length)throw new ApiError(400,'unknown_recipients');
 const {data,error}=await c.db.from('wis_campaigns').insert({sector_id:c.sectorId,name:b.name,body:b.body,contact_ids:ids,daily_limit:b.daily_limit,window_start:b.window_start,window_end:b.window_end}).select().single();check(error);return result(data,201);
});
export const PATCH=endpoint(async r=>{
 const c=await context(r,'read',true);const b=await body(r);const id=uuid(b.id);
 if(!['preview','approve','pause'].includes(String(b.action)))throw new ApiError(400,'invalid_action');
 const {data:campaign,error}=await c.db.from('wis_campaigns').select('*').eq('id',id).eq('sector_id',c.sectorId).single();check(error);if(!campaign)throw new ApiError(404,'not_found');
 const {data:contacts,error:contactError}=await c.db.from('contacts').select('id,phone_e164,display_name,consent_at,consent_source,consent_scope,opted_out_at').eq('sector_id',c.sectorId).in('id',campaign.contact_ids);check(contactError);
 const eligible=(contacts??[]).filter(x=>x.phone_e164&&x.consent_at&&x.consent_source?.trim()&&x.consent_scope?.trim()&&!x.opted_out_at);
 const preview={campaign,eligible,excluded:(contacts??[]).filter(x=>!eligible.includes(x)),missing:campaign.contact_ids.filter((id:string)=>!contacts?.some(x=>x.id===id)),execution_enabled:false};
 if(b.action==='preview')return result(preview);
 if(b.action==='approve'&&eligible.length!==campaign.contact_ids.length)throw new ApiError(409,'recipient_consent_required');
 const values=b.action==='approve'?{status:'approved',approved_at:new Date().toISOString(),approved_by:c.profileId}:{status:'paused'};
 const updated=await c.db.from('wis_campaigns').update(values).eq('id',id).eq('sector_id',c.sectorId).select().single();check(updated.error);return result({campaign:updated.data,execution_enabled:false});
});
