const userJid = value => typeof value==='string' && /^\d{1,30}(?::\d{1,5})?@(s\.whatsapp\.net|lid)$/.test(value) && !/\s/.test(value);
export function normalizeGroupMemberTag(value, observedAt=new Date().toISOString()) {
  if(typeof value?.groupId!=='string'||!/^[0-9-]{1,60}@g\.us$/.test(value.groupId)||/\s/.test(value.groupId)||!userJid(value.participant))return null;
  if(typeof value.label!=='string'||!value.label.trim()||value.label.length>256||/[\u0000-\u001f\u007f]/.test(value.label))return null;
  return {group_id:value.groupId,participant:value.participant,participant_alt:userJid(value.participantAlt)?value.participantAlt:null,
    label:value.label,message_timestamp:Number.isSafeInteger(value.messageTimestamp)&&value.messageTimestamp>=0?value.messageTimestamp:null,
    observed_at:observedAt,source:'baileys_passive_member_tag',scope:'last_received_label_not_current_membership'};
}
export function attachGroupMemberTags(emitter,{guarded,snapshot}) {
  emitter.on('group.member-tag.update',guarded(value=>{
    const data=normalizeGroupMemberTag(value);if(!data)return;
    snapshot('group_member_tag',`${data.group_id}/${data.participant}`,data);
  }));
}
export function observedGroupMemberTags(db,groupId) {
  const rows=db.prepare("SELECT payload,updated_at FROM snapshots WHERE kind='group_member_tag' AND json_extract(payload,'$.group_id')=? ORDER BY updated_at DESC,resource_id LIMIT 501").all(groupId);
  return {items:rows.slice(0,500).map(row=>({...JSON.parse(row.payload),stored_at:row.updated_at})),truncated:rows.length>500,complete:false,scope:'received_events_only'};
}
