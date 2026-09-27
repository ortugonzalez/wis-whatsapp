import {ApiError,body,check,context,endpoint,result,uuid} from '@/lib/api/core';
export const GET=endpoint(async r=>{const c=await context(r);const {data,error}=await c.db.from('contacts').select('*').eq('sector_id',c.sectorId).order('created_at',{ascending:false}).limit(100);check(error);return result(data);});
const write=(update:boolean)=>endpoint(async r=>{const c=await context(r,'contacts:write');const b=await body(r);const values:Record<string,unknown>={};for(const key of ['phone_e164','display_name','consent_at','consent_source','consent_scope','opted_out_at'])if(key in b)values[key]=b[key];
 if(!update&&!values.phone_e164)throw new ApiError(400,'phone_required');
 if(values.phone_e164&&!/^\+[1-9]\d{6,14}$/.test(String(values.phone_e164)))throw new ApiError(400,'invalid_e164');
 for(const key of ['consent_at','opted_out_at'])if(values[key]!==undefined&&values[key]!==null&&(!Number.isFinite(Date.parse(String(values[key])))||Date.parse(String(values[key]))>Date.now()+60000))throw new ApiError(400,'invalid_date');
 if(values.consent_at&&(!values.consent_source||!values.consent_scope))throw new ApiError(400,'consent_evidence_required');
 if('opted_out_at'in values&&values.opted_out_at===null)throw new ApiError(409,'opt_out_removal_requires_review');
 for(const key of ['display_name','consent_source','consent_scope'])if(values[key]!==undefined&&(typeof values[key]!=='string'||String(values[key]).length>1000))throw new ApiError(400,'invalid_contact');
 if('consent_at'in values){values.consent_recorded_by=c.profileId;values.consent_api_token_id=c.tokenId;}
 const q=update?c.db.from('contacts').update(values).eq('id',uuid(b.id)).eq('sector_id',c.sectorId):c.db.from('contacts').insert({...values,sector_id:c.sectorId});
 const {data,error}=await q.select().single();check(error);return result(data,update?200:201);
});
export const POST=write(false);export const PATCH=write(true);
