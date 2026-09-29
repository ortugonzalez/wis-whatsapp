const KNOWN_CHAT_JID=/^\d+(?:-\d+)?@(s\.whatsapp\.net|lid|g\.us)$/;

export function normalizeDisappearingModeReply(rows,target,observedAt=new Date().toISOString()){
 if(!KNOWN_CHAT_JID.test(target||'')||!Array.isArray(rows))throw Error('invalid_disappearing_mode_response');
 const matches=rows.filter(row=>row?.id===target);
 if(matches.length!==1)throw Error('no_exact_disappearing_mode_reply');
 const mode=matches[0].disappearing_mode;
 if(!mode||!Number.isSafeInteger(mode.duration)||mode.duration<0)throw Error('disappearing_mode_not_returned');
 const timestamp=mode.setAt instanceof Date?mode.setAt.getTime():typeof mode.setAt==='string'?Date.parse(mode.setAt):Number.NaN;
 const set_at=Number.isFinite(timestamp)&&timestamp>0?new Date(timestamp).toISOString():null;
 return {available:true,response_verified:true,stale:false,scope:'known_chat',duration_seconds:mode.duration,set_at,observed_at:observedAt};
}

export const isKnownChatJid=value=>KNOWN_CHAT_JID.test(value||'');
