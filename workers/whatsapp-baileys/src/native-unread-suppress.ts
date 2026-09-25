/** After CRM mark-read, accept native unreadCount=0 / >0 echoes briefly. */
const expectNativeReadUntil = new Map<string, number>();
/** After CRM mark-unread, ignore native unreadCount=0 briefly. */
const expectNativeUnreadUntil = new Map<string, number>();

function stillActive(map: Map<string, number>, conversationId: string): boolean {
  const until = map.get(conversationId);
  if (!until) return false;
  if (Date.now() >= until) {
    map.delete(conversationId);
    return false;
  }
  return true;
}

/** CRM just marked read — phone may echo unreadCount=0 or lag with >0. */
export function expectNativeReadEcho(
  conversationId: string,
  ms = 30_000,
): void {
  expectNativeReadUntil.set(conversationId, Date.now() + ms);
}

/** CRM just marked unread — ignore phone unreadCount=0 while it settles. */
export function expectNativeUnreadEcho(
  conversationId: string,
  ms = 30_000,
): void {
  expectNativeUnreadUntil.set(conversationId, Date.now() + ms);
}

/** @deprecated use expectNativeReadEcho */
export function suppressNativeUnreadEcho(
  conversationId: string,
  ms = 30_000,
): void {
  expectNativeReadEcho(conversationId, ms);
}

/** @deprecated use expectNativeUnreadEcho */
export function suppressNativeReadEcho(
  conversationId: string,
  ms = 30_000,
): void {
  expectNativeUnreadEcho(conversationId, ms);
}

export function shouldIgnoreNativeUnreadEcho(conversationId: string): boolean {
  return stillActive(expectNativeReadUntil, conversationId);
}

export function shouldIgnoreNativeReadEcho(conversationId: string): boolean {
  return stillActive(expectNativeUnreadUntil, conversationId);
}

/**
 * Companion unreadCount=0 on chats.upsert / incomplete history is often wrong
 * vs the phone inbox (MD desync). Live chats.update and history isLatest 0
 * are trusted unless we just marked unread from the CRM.
 */
export function shouldApplyNativeReadClear(conversationId: string): boolean {
  return stillActive(expectNativeReadUntil, conversationId);
}
