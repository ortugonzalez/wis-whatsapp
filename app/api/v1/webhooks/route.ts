import {randomBytes} from 'node:crypto';
import {ApiError,body,check,context,endpoint,result,uuid} from '@/lib/api/core';
export const GET=endpoint(async r=>{const c=await context(r,'webhooks:write');const {data,error}=await c.db.from('wis_webhooks').select('id,url,enabled,created_at').eq('sector_id',c.sectorId);check(error);return result(data);});
export const POST=endpoint(async r=>{const c=await context(r,'webhooks:write');const b=await body(r);let url:URL;try{url=new URL(String(b.url));}catch{throw new ApiError(400,'invalid_url');}if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new ApiError(400,'https_required');const secret=randomBytes(32).toString('hex');const {data,error}=await c.db.from('wis_webhooks').insert({sector_id:c.sectorId,url:url.href,secret,enabled:false}).select('id,url,enabled').single();check(error);return result({...data,secret},201);});
export const DELETE=endpoint(async r=>{const c=await context(r,'webhooks:write');const {error}=await c.db.from('wis_webhooks').delete().eq('sector_id',c.sectorId).eq('id',uuid(new URL(r.url).searchParams.get('id')));check(error);return result({deleted:true});});

