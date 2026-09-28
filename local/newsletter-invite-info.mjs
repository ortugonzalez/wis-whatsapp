import { randomUUID } from 'node:crypto';

const CODE=/^[A-Za-z0-9_-]{1,128}$/;
export function validNewsletterInviteCode(value){return typeof value==='string'&&CODE.test(value);}

export function newsletterByInviteMetadata(value,observedAt=new Date().toISOString()){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.id!=='string'||!/^[0-9]{1,40}@newsletter$/.test(value.id))throw new Error('invalid_newsletter_metadata_response');
 const data={id:value.id,type:'newsletter'},available_fields={id:true,type:true};
 const add=(key,item,valid)=>{if(valid(item))data[key]=item;available_fields[key]=valid(item);};
 const text=item=>typeof item==='string'&&item.length<=8192;
 const integer=item=>Number.isSafeInteger(item)&&item>=0;
 add('name',value.name,text);add('description',value.description,text);add('subscribers_count',value.subscribers,integer);add('created_at',value.creation_time,integer);
 const verified=value.verification==='VERIFIED'||value.verification==='UNVERIFIED';if(verified)data.verification=value.verification==='VERIFIED';available_fields.verification=verified;
 return {data,meta:{source:'Baileys newsletterMetadata(invite)',response_verified:true,partial:true,history_complete:false,observed_at:typeof observedAt==='string'&&Number.isFinite(Date.parse(observedAt))?new Date(observedAt).toISOString():new Date().toISOString(),available_fields,has_picture:Boolean(value.picture?.id||value.picture?.url)}};
}

const safeErrors=new Set(['read_timeout','previous_read_unresolved','connection_unavailable','connection_changed','capability_unavailable','invalid_newsletter_metadata_response','newsletter_unavailable','invalid_invite_code']);
export function createNewsletterInviteInfoRpc({processRef=process,timeoutMs=40000}={}){
 const pending=new Map();
 const onMessage=message=>{
  if(message?.type!=='wis.newsletter_invite_info.response'||typeof message.request_id!=='string')return;
  const item=pending.get(message.request_id);if(!item)return;clearTimeout(item.timer);pending.delete(message.request_id);
  if(safeErrors.has(message.error))item.reject(new Error(message.error));else if(message.error)item.reject(new Error('read_failed'));else item.resolve(message.result);
 };
 processRef.on?.('message',onMessage);
 return {
  lookup(inviteCode){
   if(!validNewsletterInviteCode(inviteCode))return Promise.reject(new Error('invalid_invite_code'));
   if(pending.size)return Promise.reject(new Error('previous_read_unresolved'));
   if(!processRef.connected||typeof processRef.send!=='function')return Promise.reject(new Error('connection_unavailable'));
   const requestId=randomUUID();return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('read_timeout'));},timeoutMs);pending.set(requestId,{resolve,reject,timer});
    try{processRef.send({type:'wis.newsletter_invite_info.request',request_id:requestId,invite_code:inviteCode},error=>{if(error&&pending.has(requestId)){clearTimeout(timer);pending.delete(requestId);reject(new Error('connection_unavailable'));}});}catch{clearTimeout(timer);pending.delete(requestId);reject(new Error('connection_unavailable'));}
   });
  },
  close(){processRef.removeListener?.('message',onMessage);for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('connection_unavailable'));}pending.clear();}
 };
}
