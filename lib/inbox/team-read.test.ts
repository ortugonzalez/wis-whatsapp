import {
  badgeCountForChat,
  crmUnreadCountFromQuery,
  formatProfileDisplayName,
  formatUnreadBadge,
  isInboundTeamUnread,
  isWaUnreadLabelName,
  teamReadAttribution,
} from "./team-read";

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEq(isWaUnreadLabelName("No leídos"), true, "unread label");
assertEq(isWaUnreadLabelName("Favoritos"), false, "not unread");

assertEq(isInboundTeamUnread("2026-08-28T12:00:00.000Z", null), false, "null cursor");
assertEq(
  isInboundTeamUnread("2026-08-28T12:00:00.001Z", "2026-08-28T12:00:00.000Z"),
  true,
  "later inbound unread",
);

assertEq(crmUnreadCountFromQuery(3), 3, "count");
assertEq(formatUnreadBadge(100), "99+", "cap");

assertEq(
  badgeCountForChat({ hasWaUnreadLabel: false, cursorUnreadCount: 5 }),
  0,
  "no label = no badge",
);
assertEq(
  badgeCountForChat({ hasWaUnreadLabel: true, cursorUnreadCount: 0 }),
  1,
  "label without cursor count = 1",
);
assertEq(
  badgeCountForChat({ hasWaUnreadLabel: true, cursorUnreadCount: 4 }),
  4,
  "label + count",
);

assertEq(
  teamReadAttribution({ via: "crm", readerName: "Ana López" }),
  "Leído por Ana López",
  "crm attribution",
);
assertEq(
  teamReadAttribution({ via: "whatsapp", readerName: null }),
  "Leído desde el teléfono",
  "wa attribution",
);
assertEq(
  teamReadAttribution({ via: null, readerName: null }),
  null,
  "no attribution yet",
);
assertEq(
  formatProfileDisplayName({ first_name: "Ana", last_name: "López", slug: "ana" }),
  "Ana López",
  "full name",
);

console.log("team-read ok");
