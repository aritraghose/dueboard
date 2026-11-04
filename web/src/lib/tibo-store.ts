import type { TiboMessage, TiboQuote, TiboServerFrame } from "@dueboard/api/tibo";

// The browser's copy of Tibo's thread (`api/src/tibo/protocol.ts`). One
// store per app, owned by `TiboProvider`, fed by one WebSocket
// (`TiboConnection`), and read by every `TiboThread` (the side panel and
// `/inbox`), so they show the same thread and the socket outlives the panel
// (for the unread dot). Other tabs and devices stay in sync because the
// agent broadcasts every frame.

/** A message you sent that the agent hasn't echoed back yet. */
export interface PendingMessage {
  readonly clientId: string;
  readonly body: string;
  readonly createdAt: number;
  readonly replyTo?: TiboQuote;
}

/** A Tibo-voiced line about a failure: shown once, never stored. */
export interface EphemeralBubble {
  readonly id: string;
  readonly body: string;
  readonly createdAt: number;
}

export interface TiboThreadState {
  readonly connected: boolean;
  /** `history` arrived at least once. */
  readonly loaded: boolean;
  /** Stored messages, oldest first. */
  readonly messages: readonly TiboMessage[];
  readonly pending: readonly PendingMessage[];
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
  readonly typing: boolean;
  readonly limitReached: boolean;
  readonly errorBubble: EphemeralBubble | null;
  /** A plain-text problem with what you sent (too long, say). */
  readonly notice: string | null;
  readonly usage: { readonly remaining: number; readonly limit: number } | null;
  /**
   * Tibo wrote since a thread was last on screen: a bubble arrived while none
   * was, or the agent says so on connect (it wrote first while the app was
   * closed). Cleared everywhere once any device shows the thread.
   */
  readonly unread: boolean;
}

const initial: TiboThreadState = {
  connected: false,
  loaded: false,
  messages: [],
  pending: [],
  hasMore: false,
  loadingOlder: false,
  typing: false,
  limitReached: false,
  errorBubble: null,
  notice: null,
  usage: null,
  unread: false,
};

export type TiboStore = ReturnType<typeof createTiboStore>;

export function createTiboStore() {
  let state = initial;
  const listeners = new Set<() => void>();
  let socket: { send: (data: string) => void } | null = null;
  // Threads on screen (the open panel, `/inbox`). None: new bubbles are unread.
  let viewers = 0;
  // Told when a turn was charged, so the usage RPC's copy (Settings) refreshes.
  let onCharged: (() => void) | undefined;
  // Told which lists Tibo changed, so the app loads them again.
  let onChanged: ((keys: readonly string[]) => void) | undefined;

  const set = (patch: Partial<TiboThreadState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  // A thread is on screen: tell the agent, so the dot clears on every device.
  const markRead = () => socket?.send(JSON.stringify({ type: "read" }));

  const receive = (frame: TiboServerFrame) => {
    switch (frame.type) {
      case "history":
        // A (re)connect: the latest page replaces whatever was loaded.
        set({
          loaded: true,
          messages: frame.messages,
          hasMore: frame.hasMore,
          loadingOlder: false,
          pending: state.pending.filter(
            (pending) => !frame.messages.some((message) => message.clientId === pending.clientId),
          ),
          unread: viewers === 0 && (frame.unread || state.unread),
        });
        if (viewers > 0 && frame.unread) markRead();
        return;
      case "read":
        if (state.unread) set({ unread: false });
        return;
      case "older": {
        const known = new Set(state.messages.map((message) => message.id));
        set({
          messages: [...frame.messages.filter((message) => !known.has(message.id)), ...state.messages],
          hasMore: frame.hasMore,
          loadingOlder: false,
        });
        return;
      }
      case "typing":
        set({ typing: frame.on });
        return;
      case "bubble": {
        const { message } = frame;
        if (state.messages.some((existing) => existing.id === message.id)) return;
        set({
          messages: [...state.messages, message],
          pending: state.pending.filter((pending) => pending.clientId !== message.clientId),
          // Tibo answered, so the last failure is old news.
          ...(message.role === "tibo" ? { errorBubble: null } : {}),
          ...(message.role === "tibo" && viewers === 0 ? { unread: true } : {}),
        });
        if (message.role === "tibo" && viewers > 0) markRead();
        return;
      }
      case "updated":
        set({
          messages: state.messages.map((message) => (message.id === frame.message.id ? frame.message : message)),
        });
        return;
      case "changed":
        onChanged?.(frame.keys);
        return;
      case "reaction":
        set({
          messages: state.messages.map((message) => {
            if (message.id !== frame.messageId) return message;
            const { reaction: _old, ...rest } = message;
            return frame.emoji === null ? rest : { ...rest, reaction: frame.emoji };
          }),
        });
        return;
      case "seen": {
        const ids = new Set(frame.messageIds);
        set({ messages: state.messages.map((message) => (ids.has(message.id) ? { ...message, seen: true } : message)) });
        return;
      }
      case "turnDone":
        set({ typing: false });
        return;
      case "usage":
        onCharged?.();
        set({
          usage: { remaining: frame.remaining, limit: frame.limit },
          limitReached: frame.remaining <= 0,
        });
        return;
      case "limitReached":
        set({ limitReached: true, typing: false });
        return;
      case "error":
        set(
          frame.bubble
            ? {
                typing: false,
                errorBubble: { id: crypto.randomUUID(), body: frame.bubble, createdAt: Date.now() },
                ...(viewers === 0 ? { unread: true } : {}),
              }
            : { notice: frame.message },
        );
        return;
    }
  };

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** The socket opened or closed. */
    attach(next: { send: (data: string) => void } | null) {
      socket = next;
      set({ connected: next !== null, ...(next === null ? { typing: false, loadingOlder: false } : {}) });
    },
    /** A raw frame from the socket; anything that isn't ours is ignored. */
    receiveRaw(data: unknown) {
      if (typeof data !== "string") return;
      try {
        const frame = JSON.parse(data) as TiboServerFrame;
        if (frame && typeof frame.type === "string") receive(frame);
      } catch {
        // Not JSON: not ours.
      }
    },

    /**
     * Sends a message, maybe as a reply to `replyTo`; it shows at once, then
     * swaps for the stored copy (whose quote the agent builds).
     */
    send(text: string, replyTo?: TiboMessage): boolean {
      const body = text.trim();
      if (!body || !socket) return false;
      const clientId = crypto.randomUUID();
      socket.send(JSON.stringify({ type: "send", text: body, clientId, ...(replyTo ? { replyTo: replyTo.id } : {}) }));
      const quote = replyTo ? { id: replyTo.id, role: replyTo.role, body: replyTo.body } : undefined;
      set({
        pending: [...state.pending, { clientId, body, createdAt: Date.now(), ...(quote ? { replyTo: quote } : {}) }],
        notice: null,
        errorBubble: null,
      });
      return true;
    },
    /** Your reaction on one of Tibo's messages (`null` takes it back). Shown when the agent confirms. */
    react(messageId: string, emoji: string | null) {
      socket?.send(JSON.stringify({ type: "react", messageId, emoji }));
    },
    /** Your answer to actions Tibo is holding; the bubble updates when the agent confirms. */
    confirm(actionId: string, approve: boolean) {
      socket?.send(JSON.stringify({ type: "confirm", actionId, approve }));
    },
    loadOlder() {
      const oldest = state.messages[0];
      if (!socket || !oldest || !state.hasMore || state.loadingOlder) return;
      socket.send(JSON.stringify({ type: "loadOlder", beforeId: oldest.id }));
      set({ loadingOlder: true });
    },
    onCharged(listener: (() => void) | undefined) {
      onCharged = listener;
    },
    onChanged(listener: ((keys: readonly string[]) => void) | undefined) {
      onChanged = listener;
    },
    /** From the usage RPC, so a fresh load knows the month is used up. */
    syncUsage(remaining: number, limit: number) {
      if (state.usage) return;
      set({ usage: { remaining, limit }, limitReached: remaining <= 0 });
    },
    /** A thread is on screen until the returned function runs. */
    view() {
      viewers += 1;
      if (state.unread) {
        set({ unread: false });
        markRead();
      }
      return () => {
        viewers -= 1;
      };
    },
  };
}
