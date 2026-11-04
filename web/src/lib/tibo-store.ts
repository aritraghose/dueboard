import type { TiboActivity, TiboAttachment, TiboMessage, TiboQuote, TiboServerFrame } from "@dueboard/api/tibo";
import { fileNames } from "./tibo-files.ts";

export interface PendingMessage {
  readonly clientId: string;
  readonly body: string;
  readonly createdAt: number;
  readonly replyTo?: TiboQuote;
  readonly attachments?: readonly TiboAttachment[];
}

export interface EphemeralBubble {
  readonly id: string;
  readonly body: string;
  readonly createdAt: number;
}

export interface TiboThreadState {
  readonly connected: boolean;
  readonly loaded: boolean;
  readonly messages: readonly TiboMessage[];
  readonly pending: readonly PendingMessage[];
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
  readonly typing: boolean;
  readonly limitReached: boolean;
  readonly errorBubble: EphemeralBubble | null;
  readonly notice: string | null;
  readonly usage: { readonly remaining: number; readonly limit: number } | null;
  readonly unread: boolean;
  readonly activities: Readonly<Record<string, TiboActivity>>;
}

const LIVE_ACTIVITY_LIMIT = 400;

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
  activities: {},
};

export type TiboStore = ReturnType<typeof createTiboStore>;

export function createTiboStore() {
  let state = initial;
  const listeners = new Set<() => void>();
  let socket: { send: (data: string) => void } | null = null;
  let viewers = 0;
  let onCharged: (() => void) | undefined;
  let onChanged: ((keys: readonly string[]) => void) | undefined;

  const set = (patch: Partial<TiboThreadState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const markRead = () => socket?.send(JSON.stringify({ type: "read" }));

  const receive = (frame: TiboServerFrame) => {
    switch (frame.type) {
      case "history":
        set({
          loaded: true,
          messages: frame.messages,
          hasMore: frame.hasMore,
          loadingOlder: false,
          pending: state.pending.filter(
            (pending) => !frame.messages.some((message) => message.clientId === pending.clientId),
          ),
          unread: viewers === 0 && (frame.unread || state.unread),
          activities: {
            ...Object.fromEntries(Object.entries(state.activities).filter(([, activity]) => activity.status !== "running")),
            ...Object.fromEntries((frame.activity ?? []).map((activity) => [activity.id, activity])),
          },
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
      case "activity": {
        let activities: Record<string, TiboActivity> = { ...state.activities, [frame.activity.id]: frame.activity };
        const ids = Object.keys(activities);
        if (ids.length > LIVE_ACTIVITY_LIMIT) {
          const finished = Object.values(activities)
            .filter((activity) => activity.status !== "running")
            .sort((a, b) => a.startedAt - b.startedAt);
          const drop = new Set(finished.slice(0, ids.length - LIVE_ACTIVITY_LIMIT).map((activity) => activity.id));
          activities = Object.fromEntries(Object.entries(activities).filter(([id]) => !drop.has(id)));
        }
        set({ activities });
        return;
      }
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

    attach(next: { send: (data: string) => void } | null) {
      socket = next;
      set({ connected: next !== null, ...(next === null ? { typing: false, loadingOlder: false } : {}) });
    },
    receiveRaw(data: unknown) {
      if (typeof data !== "string") return;
      try {
        const frame = JSON.parse(data) as TiboServerFrame;
        if (frame && typeof frame.type === "string") receive(frame);
      } catch {
      }
    },

    send(text: string, replyTo?: TiboMessage, attachments: readonly TiboAttachment[] = []): boolean {
      const body = text.trim();
      if ((!body && attachments.length === 0) || !socket) return false;
      const clientId = crypto.randomUUID();
      socket.send(
        JSON.stringify({
          type: "send",
          text: body,
          clientId,
          ...(replyTo ? { replyTo: replyTo.id } : {}),
          ...(attachments.length > 0 ? { attachments: attachments.map((attachment) => attachment.id) } : {}),
        }),
      );
      const quote = replyTo
        ? { id: replyTo.id, role: replyTo.role, body: replyTo.body || fileNames(replyTo.attachments) }
        : undefined;
      set({
        pending: [
          ...state.pending,
          {
            clientId,
            body,
            createdAt: Date.now(),
            ...(quote ? { replyTo: quote } : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          },
        ],
        notice: null,
        errorBubble: null,
      });
      return true;
    },
    react(messageId: string, emoji: string | null) {
      socket?.send(JSON.stringify({ type: "react", messageId, emoji }));
    },
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
    syncUsage(remaining: number, limit: number) {
      if (state.usage) return;
      set({ usage: { remaining, limit }, limitReached: remaining <= 0 });
    },
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
