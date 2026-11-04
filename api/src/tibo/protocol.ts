export type TiboRole = "user" | "tibo" | "system_event";

export interface TiboMessage {
  readonly id: string;
  readonly turnId: string;
  readonly role: TiboRole;
  readonly body: string;
  readonly createdAt: number;
  readonly clientId?: string;
  readonly reaction?: string;
  readonly seen?: boolean;
  readonly replyTo?: TiboQuote;
  readonly receipts?: readonly TiboReceipt[];
  readonly confirm?: TiboConfirm;
  readonly relay?: TiboRelayCard;
  readonly attachments?: readonly TiboAttachment[];
}

export type TiboAttachmentKind = "image" | "pdf" | "text" | "document" | "other";

export interface TiboAttachment {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly kind: TiboAttachmentKind;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
}

export type TiboUpload =
  | { readonly ok: true; readonly attachment: TiboAttachment }
  | {
      readonly ok: false;
      readonly error: "too_large" | "empty" | "limited" | "storage_full" | "daily_limit" | "failed";
    };

export const TIBO_FILES_PATH = "files";
export const TIBO_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const TIBO_MAX_ATTACHMENTS = 4;
export const TIBO_FILE_NAME_MAX_LENGTH = 120;
export const tiboFileUrl = (id: string, download = false) =>
  `/agents/${TIBO_AGENT}/me/${TIBO_FILES_PATH}/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;

export type TiboRelayStatus = "pending" | "delivered" | "answered" | "declined" | "expired" | "cancelled";

export interface TiboRelayCard {
  readonly id: string;
  readonly direction: "in" | "out";
  readonly person: { readonly username: string; readonly name: string };
  readonly message: string;
  readonly status: TiboRelayStatus;
  readonly answer?: string;
  readonly expiresAt: number;
}

export type TiboItemKind = "task" | "habit" | "goal" | "note" | "session" | "tag";

export interface TiboItemRef {
  readonly kind: TiboItemKind;
  readonly id: string;
  readonly title?: string;
}

export interface TiboReceipt {
  readonly text: string;
  readonly verb?: string;
  readonly item?: TiboItemRef;
  readonly failed?: boolean;
}

export interface TiboHeldItem {
  readonly text: string;
  readonly item?: TiboItemRef;
}

export interface TiboConfirm {
  readonly actionId: string;
  readonly items: readonly (TiboHeldItem | string)[];
  readonly status: TiboConfirmStatus;
}

export const heldItem = (item: TiboHeldItem | string): TiboHeldItem =>
  typeof item === "string" ? { text: item } : item;

export type TiboConfirmStatus = "pending" | "confirmed" | "cancelled" | "expired";

export interface TiboQuote {
  readonly id: string;
  readonly role: TiboRole;
  readonly body: string;
}

export type TiboClientFrame =
  | {
      readonly type: "send";
      readonly text: string;
      readonly clientId: string;
      readonly replyTo?: string;
      readonly attachments?: readonly string[];
    }
  | { readonly type: "loadOlder"; readonly beforeId: string }
  | { readonly type: "react"; readonly messageId: string; readonly emoji: string | null }
  | { readonly type: "confirm"; readonly actionId: string; readonly approve: boolean }
  | { readonly type: "read" };

export type TiboServerFrame =
  | {
      readonly type: "history";
      readonly messages: readonly TiboMessage[];
      readonly hasMore: boolean;
      readonly unread: boolean;
      readonly activity?: readonly TiboActivity[];
    }
  | { readonly type: "read" }
  | { readonly type: "older"; readonly messages: readonly TiboMessage[]; readonly hasMore: boolean }
  | { readonly type: "typing"; readonly on: boolean }
  | { readonly type: "bubble"; readonly message: TiboMessage }
  | { readonly type: "reaction"; readonly messageId: string; readonly emoji: string | null }
  | { readonly type: "updated"; readonly message: TiboMessage }
  | { readonly type: "changed"; readonly keys: readonly string[] }
  | { readonly type: "seen"; readonly messageIds: readonly string[] }
  | { readonly type: "turnDone"; readonly turnId: string }
  | { readonly type: "activity"; readonly activity: TiboActivity }
  | { readonly type: "usage"; readonly remaining: number; readonly limit: number }
  | { readonly type: "limitReached"; readonly limit: number }
  | { readonly type: "error"; readonly message: string; readonly bubble?: string };

export type TiboActivityKind =
  | "reply"
  | "check_in"
  | "reminder"
  | "relay"
  | "confirm"
  | "memory"
  | "file"
  | "reading"
  | "context"
  | "thinking"
  | "tool"
  | "writing"
  | "step";

export type TiboActivityStatus = "running" | "done" | "failed" | "skipped";

export interface TiboActivity {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: TiboActivityKind;
  readonly label: string;
  readonly detail?: string;
  readonly status: TiboActivityStatus;
  readonly startedAt: number;
  readonly endedAt?: number;
}

export interface TiboActivityThread extends TiboActivity {
  readonly steps: readonly TiboActivity[];
}

export function currentActivity(running: readonly TiboActivity[]): TiboActivity | null {
  const live = running.filter((activity) => activity.status === "running");
  const newest = (list: readonly TiboActivity[]) =>
    list.reduce<TiboActivity | null>((best, next) => (!best || next.startedAt >= best.startedAt ? next : best), null);
  return newest(live.filter((activity) => activity.parentId !== undefined)) ?? newest(live);
}

export const TIBO_ACTIVITY_PATH = "activity";
export const TIBO_ACTIVITY_PAGE = 30;

export interface TiboSentFile extends TiboAttachment {
  readonly messageId: string;
  readonly sentAt: number;
}

export const TIBO_MEDIA_LIMIT = 500;

export const TIBO_AGENT = "tibo-agent";
export const TIBO_HISTORY_PAGE = 50;
export const TIBO_OLDER_PAGE = 50;
export const TIBO_MAX_BUBBLES = 5;
export const TIBO_QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"] as const;
export const TIBO_CONFIRM_TTL_MS = 30 * 60 * 1000;
export const TIBO_QUOTE_LENGTH = 280;
export const TIBO_LOW_USAGE = 30;

export const TIBO_MEMORY_KINDS = ["fact", "preference", "person", "event", "plan"] as const;
export type TiboMemoryKind = (typeof TIBO_MEMORY_KINDS)[number];

export interface TiboMemory {
  readonly id: string;
  readonly text: string;
  readonly kind: TiboMemoryKind;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const TIBO_MEMORIES_PATH = "memories";
export const TIBO_MEMORIES_LIMIT = 500;
