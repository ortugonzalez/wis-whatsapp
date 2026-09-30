const MAX_CHAT_JID_LENGTH = 256;

/**
 * Derive only chat categories encoded unambiguously in a WhatsApp JID namespace.
 * The input is never returned, logged, or included in coverage output.
 */
export function classifyWhatsAppChatType(jid) {
  if (typeof jid !== 'string' || jid.length === 0 || jid.length > MAX_CHAT_JID_LENGTH || /\s|[\u0000-\u001f\u007f]/.test(jid)) return null;
  const separator = jid.lastIndexOf('@');
  if (separator <= 0 || separator === jid.length - 1 || jid.indexOf('@') !== separator) return null;
  const local = jid.slice(0, separator), server = jid.slice(separator + 1);
  if (server === 'g.us') return 'group';
  if (server === 's.whatsapp.net' || server === 'lid') return 'contact';
  if (server === 'newsletter') return 'newsletter';
  if (server === 'broadcast') return local === 'status' ? 'stories' : 'broadcast';
  return null;
}
