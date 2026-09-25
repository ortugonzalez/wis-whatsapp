import {
  inboundSoundStorageKey,
  shouldPlayInboundSound,
} from "./inbound-sound";

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEq(
  inboundSoundStorageKey("sec-1"),
  "whatsapp-ui:inbound-sound:sec-1",
  "storage key",
);

assertEq(
  shouldPlayInboundSound({
    enabled: true,
    direction: "in",
    conversationId: "c-other",
    activeConversationId: "c-active",
    messageSectorId: "s1",
    activeSectorId: "s1",
  }),
  true,
  "inbound other chat",
);

assertEq(
  shouldPlayInboundSound({
    enabled: true,
    direction: "in",
    conversationId: "c-active",
    activeConversationId: "c-active",
    messageSectorId: "s1",
    activeSectorId: "s1",
  }),
  false,
  "active chat silent",
);

assertEq(
  shouldPlayInboundSound({
    enabled: false,
    direction: "in",
    conversationId: "c-other",
    activeConversationId: null,
    messageSectorId: "s1",
    activeSectorId: "s1",
  }),
  false,
  "muted",
);

assertEq(
  shouldPlayInboundSound({
    enabled: true,
    direction: "out",
    conversationId: "c-other",
    activeConversationId: null,
    messageSectorId: "s1",
    activeSectorId: "s1",
  }),
  false,
  "outbound silent",
);

assertEq(
  shouldPlayInboundSound({
    enabled: true,
    direction: "in",
    conversationId: "c-other",
    activeConversationId: null,
    messageSectorId: "s2",
    activeSectorId: "s1",
  }),
  false,
  "other sector silent",
);

console.log("inbound-sound.selfcheck: ok");
