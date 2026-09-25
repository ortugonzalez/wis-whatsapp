"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Composer,
  type ComposerEnqueueFailure,
  type QuoteTarget,
} from "@/app/components/inbox/composer";
import {
  ForwardPicker,
  type ForwardTarget,
} from "@/app/components/inbox/forward-picker";
import { MessageContextMenuLayer } from "@/app/components/inbox/message-context-menu";
import { MessageToast } from "@/app/components/inbox/message-toast";
import {
  ThreadView,
  type ThreadMessage,
} from "@/app/components/inbox/thread-view";
import {
  retryOutboundMessage,
  sendOutboundMessage,
} from "@/app/actions/send-message";

type Props = {
  conversationId: string;
  channelConnected: boolean;
  /** null = Baileys / ignore. */
  initialKapsoWindowOpen?: boolean | null;
  initial: ThreadMessage[];
  initiallyUnread?: boolean;
  forwardTargets: ForwardTarget[];
  initialTeamReadAt?: string | null;
  initialTeamReadByName?: string | null;
  initialTeamReadVia?: "crm" | "whatsapp" | null;
};

function isLocalMessageId(id: string) {
  return id.startsWith("local:");
}

export function ThreadWithComposer({
  conversationId,
  channelConnected,
  initialKapsoWindowOpen = null,
  initial,
  initiallyUnread = false,
  forwardTargets,
  initialTeamReadAt = null,
  initialTeamReadByName = null,
  initialTeamReadVia = null,
}: Props) {
  const [quote, setQuote] = useState<QuoteTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(
    null,
  );
  const [localMessages, setLocalMessages] = useState<ThreadMessage[]>([]);
  const [focusSignal, setFocusSignal] = useState(0);
  const [kapsoWindowOpen, setKapsoWindowOpen] = useState(
    initialKapsoWindowOpen,
  );

  useEffect(() => {
    setLocalMessages([]);
    setQuote(null);
    setKapsoWindowOpen(initialKapsoWindowOpen);
  }, [conversationId, initialKapsoWindowOpen]);

  const bumpComposerFocus = useCallback(() => {
    setFocusSignal((n) => n + 1);
  }, []);

  const onInboundMessage = useCallback(() => {
    if (initialKapsoWindowOpen !== null) {
      setKapsoWindowOpen(true);
    }
  }, [initialKapsoWindowOpen]);

  const onEnqueueFailed = useCallback((failure: ComposerEnqueueFailure) => {
    const row: ThreadMessage = {
      id: failure.clientId,
      wa_message_id: null,
      direction: "out",
      type: "text",
      body: failure.body,
      media_bucket_path: null,
      delivery_status: "failed",
      created_at: new Date().toISOString(),
      deleted_at: null,
      author_label: "Vos",
      quoted_message_id: failure.quotedMessageId,
      quoted_wa_message_id: null,
      quoted_body_preview: null,
    };
    setLocalMessages((prev) => [...prev, row]);
  }, []);

  const onRetryFailed = useCallback(
    async (message: ThreadMessage): Promise<boolean> => {
      if (isLocalMessageId(message.id)) {
        setLocalMessages((prev) =>
          prev.map((r) =>
            r.id === message.id
              ? { ...r, delivery_status: "pending" }
              : r,
          ),
        );
        const result = await sendOutboundMessage({
          conversationId,
          type: "text",
          body: message.body ?? "",
          quotedMessageId: message.quoted_message_id,
        });
        if (!result.ok) {
          setLocalMessages((prev) =>
            prev.map((r) =>
              r.id === message.id
                ? { ...r, delivery_status: "failed" }
                : r,
            ),
          );
          return false;
        }
        setLocalMessages((prev) => prev.filter((r) => r.id !== message.id));
        return true;
      }

      const result = await retryOutboundMessage({
        conversationId,
        messageId: message.id,
      });
      return result.ok;
    },
    [conversationId],
  );

  return (
    <>
      <ThreadView
        key={conversationId}
        conversationId={conversationId}
        initial={initial}
        initiallyUnread={initiallyUnread}
        initialTeamReadAt={initialTeamReadAt}
        initialTeamReadByName={initialTeamReadByName}
        initialTeamReadVia={initialTeamReadVia}
        localMessages={localMessages}
        onRetryFailed={onRetryFailed}
        onRetrySettled={bumpComposerFocus}
        onInboundMessage={onInboundMessage}
      />
      <Composer
        conversationId={conversationId}
        channelConnected={channelConnected}
        kapsoWindowOpen={kapsoWindowOpen}
        quote={quote}
        onClearQuote={() => setQuote(null)}
        onEnqueueFailed={onEnqueueFailed}
        focusSignal={focusSignal}
      />
      <MessageContextMenuLayer
        conversationId={conversationId}
        channelConnected={channelConnected}
        onReply={setQuote}
        onCopy={() => setToast("Texto copiado")}
        onForward={(messageId) => setForwardMessageId(messageId)}
      />
      <ForwardPicker
        open={forwardMessageId != null}
        sourceConversationId={conversationId}
        messageId={forwardMessageId ?? ""}
        targets={forwardTargets}
        channelConnected={channelConnected}
        onClose={() => setForwardMessageId(null)}
        onSuccess={() => setToast("Mensaje en cola para reenviar")}
      />
      <MessageToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
