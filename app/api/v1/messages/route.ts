import { ApiError,body,check,context,endpoint,hash,result } from '@/lib/api/core';
export const GET=endpoint(async r=>{const c=await context(r);const u=new URL(r.url);let q=c.db.from('messages').select('*').eq('sector_id',c.sectorId).order('created_at',{ascending:false}).limit(50);if(u.searchParams.get('conversation_id'))q=q.eq('conversation_id',u.searchParams.get('conversation_id'));if(u.searchParams.get('before'))q=q.lt('created_at',u.searchParams.get('before'));const {data,error}=await q;check(error);return result(data);});
export const POST=endpoint(async r=>{
 if(process.env.WIS_OUTBOUND_ENABLED!=='true')throw new ApiError(409,'outbound_disabled');
 const c=await context(r,'send');const b=await body(r);const key=r.headers.get('Idempotency-Key');
 if(!key||key.length>128||! /^[\x21-\x7e]+$/.test(key))throw new ApiError(400,'idempotency_key_required');
 if(typeof b.to!=='string'||!/^\+[1-9]\d{6,14}$/.test(b.to))throw new ApiError(400,'invalid_e164');
 const type=b.type??'text';if(!['text','image','audio','document'].includes(String(type)))throw new ApiError(422,'unsupported_message_type');
 if(type==='text'&&(typeof b.body!=='string'||!b.body.trim()||b.body.length>10000))throw new ApiError(400,'invalid_body');
 if(b.purpose&&b.purpose!=='transactional')throw new ApiError(409,'campaigns_disabled');
 if(type!=='text'&&(typeof b.media_bucket_path!=='string'||!b.media_bucket_path.startsWith(c.sectorId+'/')||b.media_bucket_path.includes('..')))throw new ApiError(400,'upload_media_first');
 if(type!=='text'){
  const filename=String(b.media_bucket_path).slice(c.sectorId.length+1);
  if(!/^[0-9a-f-]{36}\.(jpg|png|webp|ogg|mp3|m4a|pdf)$/.test(filename))throw new ApiError(400,'invalid_media_path');
  const {data:files,error:mediaError}=await c.db.storage.from('whatsapp-media').list(c.sectorId,{search:filename,limit:2});check(mediaError);
  const file=files?.find(x=>x.name===filename);if(!file)throw new ApiError(404,'media_not_found');
  const mime=String(file.metadata?.mimetype??'');if(type==='image'&&!mime.startsWith('image/')||type==='audio'&&!mime.startsWith('audio/')||type==='document'&&mime!=='application/pdf')throw new ApiError(400,'media_type_mismatch');
 }
 const payload={to_e164:b.to,type,body:typeof b.body==='string'?b.body:null,media_bucket_path:type==='text'?null:b.media_bucket_path,purpose:'transactional'};
 const fingerprint=hash(JSON.stringify(payload));
 const previous=await c.db.from('whatsapp_outbox').select('id,status,request_hash').eq('sector_id',c.sectorId).eq('idempotency_key',key).maybeSingle();check(previous.error);
 if(previous.data){if(previous.data.request_hash!==fingerprint)throw new ApiError(409,'idempotency_conflict');return result(previous.data,200);}
 const contact=await c.db.from('contacts').select('opted_out_at,consent_at,consent_source,consent_scope').eq('sector_id',c.sectorId).eq('phone_e164',b.to).maybeSingle();check(contact.error);if(contact.data?.opted_out_at)throw new ApiError(403,'contact_opted_out');if(!contact.data?.consent_at||!contact.data.consent_source?.trim()||!contact.data.consent_scope?.trim())throw new ApiError(403,'contact_consent_required');
 const {data,error}=await c.db.rpc('wis_enqueue_message',{p_sector_id:c.sectorId,p_token_id:c.tokenId,p_profile_id:c.profileId,p_key:key,p_hash:fingerprint,p_to:payload.to_e164,p_type:payload.type,p_body:payload.body,p_media:payload.media_bucket_path});
 if(error?.message.includes('idempotency_conflict'))throw new ApiError(409,'idempotency_conflict');
 if(error?.message.includes('contact_consent_required')||error?.message.includes('contact_opted_out'))throw new ApiError(403,'contact_consent_required');
 if(error?.code==='23505'){const replay=await c.db.from('whatsapp_outbox').select('id,status,request_hash').eq('sector_id',c.sectorId).eq('idempotency_key',key).single();check(replay.error);if(!replay.data||replay.data.request_hash!==fingerprint)throw new ApiError(409,'idempotency_conflict');return result(replay.data);}
 check(error);return result({id:data.id,status:data.status,created_at:data.created_at},202);
});
