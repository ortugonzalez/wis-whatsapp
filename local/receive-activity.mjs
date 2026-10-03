// Activity means an inbound envelope observed on this socket, not a new unique
// message, successful persistence, delivery to a person, or complete history.
export function attachReceiveActivity(emitter,{guarded,snapshot,now=()=>new Date().toISOString()}) {
  emitter.on('messages.upsert',guarded(value=>{
    if(!Array.isArray(value?.messages))return;
    const counts={inbound:0,outbound:0,unknown_direction:0,without_content:0};
    for(const message of value.messages){
      if(message?.key?.fromMe===false)counts.inbound++;
      else if(message?.key?.fromMe===true)counts.outbound++;
      else counts.unknown_direction++;
      if(!message?.message||typeof message.message!=='object')counts.without_content++;
    }
    snapshot('message_activity','last_upsert',{observed_at:now(),source:'baileys.messages.upsert',upsert_type:['notify','append'].includes(value.type)?value.type:'other',envelopes:value.messages.length,...counts,scope:'last_upsert_batch',unique_messages:false,persistence_confirmed:false});
  }));
  emitter.on('messages.upsert',guarded(value=>{
    if(!['notify','append'].includes(value?.type)||!Array.isArray(value.messages))return;
    const count=value.messages.filter(m=>m?.key?.fromMe===false&&typeof m.key.remoteJid==='string'&&m.key.remoteJid.length>0&&m.message&&typeof m.message==='object').length;
    if(!count)return;
    snapshot('receive_activity','inbound_'+value.type,{observed_at:now(),source:'baileys.messages.upsert',upsert_type:value.type,inbound_envelopes:count,scope:'last_inbound_batch',unique_messages:false,persistence_confirmed:false});
  }));
}
