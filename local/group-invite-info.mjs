import { randomUUID } from 'node:crypto';

const CODE = /^[A-Za-z0-9_-]{1,128}$/;
const JID = /^\d{1,32}(?::\d{1,8})?@(s\.whatsapp\.net|lid)$/;

export function validGroupInviteCode(value) {
  return typeof value === 'string' && CODE.test(value);
}

export function groupMetadataByInviteCode(value, observedAt = new Date().toISOString()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !/^\d{1,32}(?:-\d{1,32})?@g\.us$/.test(value.id)) {
    throw new Error('invalid_group_metadata_response');
  }
  const integer = item => Number.isSafeInteger(item) && item >= 0 ? item : undefined;
  const text = item => typeof item === 'string' && item.length <= 8192 ? item : undefined;
  const available = {};
  const data = { id: value.id };
  available.id = true;
  const add = (key, item) => { if (item !== undefined) { data[key] = item; available[key] = true; } else available[key] = false; };
  add('name_at', integer(value.subjectTime));
  add('name', text(value.subject));
  const participants = Array.isArray(value.participants) ? value.participants : [];
  const bounded = participants.slice(0, 4096).flatMap(participant => {
    if (!participant || !JID.test(participant.id || '')) return [];
    const rank = participant.admin === 'superadmin' ? 'creator' : participant.admin === 'admin' ? 'admin' : 'member';
    return [{ id: participant.id, rank }];
  });
  add('participants', Array.isArray(value.participants) ? bounded : undefined);
  add('participantsCount', Number.isSafeInteger(value.size) && value.size >= 0 ? value.size : Array.isArray(value.participants) && value.participants.length <= 4096 ? value.participants.length : undefined);
  add('created_at', integer(value.creation));
  add('created_by', text(value.owner));
  add('ephemeral', integer(value.ephemeralDuration));
  return {
    data,
    meta: {
      source: 'Baileys groupGetInviteInfo',
      response_verified: true,
      observed_at: observedAt,
      available_fields: available,
      participants_truncated: participants.length > 4096,
    },
  };
}

const safeErrors = new Set(['read_timeout', 'previous_read_unresolved', 'connection_unavailable', 'connection_changed', 'capability_unavailable', 'invalid_group_metadata_response']);

export function createGroupInviteInfoRpc({ processRef = process, timeoutMs = 40000 } = {}) {
  const pending = new Map();
  const onMessage = message => {
    if (message?.type !== 'wis.group_invite_info.response' || typeof message.request_id !== 'string') return;
    const item = pending.get(message.request_id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.request_id);
    if (safeErrors.has(message.error)) item.reject(new Error(message.error));
    else if (message.error) item.reject(new Error('read_failed'));
    else item.resolve(message.result);
  };
  processRef.on?.('message', onMessage);
  return {
    lookup(inviteCode) {
      if (!validGroupInviteCode(inviteCode)) return Promise.reject(new Error('invalid_invite_code'));
      if (pending.size) return Promise.reject(new Error('previous_read_unresolved'));
      if (!processRef.connected || typeof processRef.send !== 'function') return Promise.reject(new Error('connection_unavailable'));
      const requestId = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('read_timeout')); }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        try { processRef.send({ type: 'wis.group_invite_info.request', request_id: requestId, invite_code: inviteCode }, error => {
          if (error && pending.has(requestId)) { clearTimeout(timer); pending.delete(requestId); reject(new Error('connection_unavailable')); }
        }); } catch { clearTimeout(timer); pending.delete(requestId); reject(new Error('connection_unavailable')); }
      });
    },
    close() {
      processRef.removeListener?.('message', onMessage);
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('connection_unavailable')); }
      pending.clear();
    },
  };
}
