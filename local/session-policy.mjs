export const SESSION_IDLE_TTL_MS = 12 * 60 * 60_000;
export const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60_000;
export const SESSION_REFRESH_MIN_EXTENSION_MS = 60_000;

export function sessionAbsoluteExpiry(createdAt) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) ? created + SESSION_ABSOLUTE_TTL_MS : null;
}

export function isSessionActive(session, now = Date.now()) {
  if (!session || !Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= now) return false;
  const absoluteExpiry = sessionAbsoluteExpiry(session.created_at);
  return absoluteExpiry !== null && absoluteExpiry > now;
}

export function shouldRefreshSession(session, now = Date.now()) {
  if (!isSessionActive(session, now)) return false;
  const proposedExpiry = nextSessionExpiry(session, now);
  return Boolean(proposedExpiry && Date.parse(proposedExpiry) - Date.parse(session.expires_at) >= SESSION_REFRESH_MIN_EXTENSION_MS);
}

export function nextSessionExpiry(session, now = Date.now()) {
  if (!isSessionActive(session, now)) return null;
  const absoluteExpiry = sessionAbsoluteExpiry(session.created_at);
  return new Date(Math.min(now + SESSION_IDLE_TTL_MS, absoluteExpiry)).toISOString();
}
