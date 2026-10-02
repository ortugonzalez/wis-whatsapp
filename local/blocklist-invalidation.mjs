export function createBlocklistInvalidation(db) {
  let revision=0;
  return {
    get revision(){return revision;},
    observe(value){
      if(!['add','remove'].includes(value?.type)||!Array.isArray(value.blocklist)||!value.blocklist.length||value.blocklist.length>10000)return false;
      if(!value.blocklist.every(jid=>typeof jid==='string'&&/^\d{1,30}@(s\.whatsapp\.net|lid)$/.test(jid)&&! /\s/.test(jid)))return false;
      revision++;
      const now=new Date().toISOString();
      // Preserve the prior verified list and its success date; a delta is not a list.
      db.prepare("UPDATE snapshots SET payload=json_set(payload,'$.stale',json('true'),'$.response_verified',json('false'),'$.stale_reason','passive_blocklist_change','$.last_invalidated_at',?),updated_at=? WHERE kind='blocklist' AND resource_id='wis-5679'").run(now,now);
      return true;
    }
  };
}
