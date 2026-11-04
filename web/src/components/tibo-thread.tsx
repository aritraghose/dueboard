import { MAX_CHAT_MESSAGE_LENGTH } from "@dueboard/api/limits";
import {
  TIBO_LOW_USAGE,
  TIBO_QUICK_REACTIONS,
  heldItem,
  type TiboConfirm,
  type TiboHeldItem,
  type TiboMessage,
  type TiboQuote,
} from "@dueboard/api/tibo";
import { Link } from "@tanstack/react-router";
import {
  CheckCheckIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  HandIcon,
  NotebookPenIcon,
  PencilIcon,
  ReplyIcon,
  SendIcon,
  SquareIcon,
  TagIcon,
  TimerIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { Markdown } from "@/components/markdown";
import { TiboMark } from "@/components/tibo-mark";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { TiboItemsProvider, TiboReceipts, shownReceipts } from "@/components/tibo-items";
import { useTibo, useTiboThread } from "@/hooks/use-tibo";
import type { TiboThreadState } from "@/lib/tibo-store";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Help me plan this week around my deadlines.",
  "Break a big assignment into steps I can finish.",
  "Everything is due at once. Where do I start?",
];

/** Back-to-back messages from one side within this long share a group. */
const GROUP_GAP_MS = 5 * 60_000;
/** Scrolled this close to the top, older messages load. */
const LOAD_OLDER_PX = 160;

/**
 * Tibo's thread: the side panel and `/inbox` both render this, reading the
 * app's one copy of the thread (`lib/tibo-store.ts`), so they always agree.
 * One thread forever: no new chat, no clear button. Renders in the browser
 * only. `headerEnd` adds controls (the panel's close button); `onNavigate`
 * runs when a link inside it leaves the page (the panel closes).
 */
export function TiboThread({
  className,
  headerEnd,
  onNavigate,
  fullPage = false,
}: {
  className?: string;
  headerEnd?: React.ReactNode;
  onNavigate?: () => void;
  /** On a page of its own (`/inbox`): from `md` up the message box is half the thread's width, centered. */
  fullPage?: boolean;
}) {
  const { store } = useTibo();
  const thread = useTiboThread();
  // While this is on screen, Tibo's new bubbles aren't unread.
  React.useEffect(() => store.view(), [store]);
  // The message you're replying to (swipe or Reply), until you send or cancel.
  const [replyTo, setReplyTo] = React.useState<TiboMessage | null>(null);

  return (
    <section
      aria-label="Tibo"
      className={cn("relative flex flex-col overflow-hidden text-card-foreground", className)}
    >
      <TiboItemsProvider>
        <MessageScrollerProvider autoScroll>
          <ThreadHeader thread={thread} headerEnd={headerEnd} />
          <div className="min-h-0 flex-1">
            {!thread.loaded ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Loading your chat…
              </div>
            ) : thread.messages.length === 0 && thread.pending.length === 0 ? (
              <ThreadEmpty canSend={thread.connected && !thread.limitReached} send={store.send} />
            ) : (
              <ThreadMessages
                thread={thread}
                loadOlder={store.loadOlder}
                onReply={setReplyTo}
                onReact={store.react}
                onConfirm={store.confirm}
              />
            )}
          </div>
          {/* Narrower than the thread on wide screens: half its width on a page of its own. */}
          <div
            className={cn(
              "flex flex-col gap-2 px-3 pt-2 pb-3 md:mx-auto",
              fullPage ? "md:w-1/2 md:px-0" : "md:w-[88%] md:px-4",
            )}
          >
            {thread.limitReached ? (
              <LimitNotice onNavigate={onNavigate} />
            ) : (
              <Composer
                thread={thread}
                send={store.send}
                replyTo={replyTo}
                clearReply={() => setReplyTo(null)}
              />
            )}
          </div>
        </MessageScrollerProvider>
      </TiboItemsProvider>
    </section>
  );
}

/**
 * Tibo floats over the top of the thread, like a contact in a messaging
 * app: its avatar on a disc, and under it a pill with its name, or what it's
 * doing. Messages scroll (and fade) beneath. Each time it starts typing a
 * bubble, the rings turn.
 */
function ThreadHeader({ thread, headerEnd }: { thread: TiboThreadState; headerEnd?: React.ReactNode }) {
  const [spins, setSpins] = React.useState(0);
  React.useEffect(() => {
    if (thread.typing) setSpins((n) => n + 1);
  }, [thread.typing]);
  // What Tibo is doing, under its name; nothing when it's idle.
  const activity = thread.typing ? "typing…" : thread.loaded && !thread.connected ? "reconnecting…" : null;
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3">
      <div className="flex flex-col items-center">
        <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1 shadow-lg">
          <TiboMark spin={spins} className="size-11" />
        </div>
        <div className="-mt-2 flex flex-col items-center rounded-2xl border border-bubble-tibo-border bg-bubble-tibo px-3.5 py-0.5 text-bubble-tibo-foreground shadow-md">
          <h2 className="text-[0.9375rem] leading-snug font-semibold">Tibo</h2>
          {/* Always there, so screen readers hear it change; empty (and hidden) when idle. */}
          <p
            aria-live="polite"
            className="-mt-0.5 pb-0.5 text-[0.6875rem] leading-tight text-muted-foreground empty:hidden"
          >
            {activity}
          </p>
        </div>
      </div>
      {headerEnd && (
        <div className="pointer-events-auto absolute top-3 right-3 rounded-full border border-bubble-tibo-border bg-bubble-tibo shadow-md">
          {headerEnd}
        </div>
      )}
    </header>
  );
}

function ThreadEmpty({ canSend, send }: { canSend: boolean; send: (text: string) => boolean }) {
  return (
    <Empty className="h-full pt-24">
      <EmptyHeader>
        <EmptyMedia>
          <TiboMark className="size-12" />
        </EmptyMedia>
        <EmptyTitle>Hey, I'm Tibo</EmptyTitle>
        <EmptyDescription>
          Tell me what's due and I'll tell you what to do first. Loudly, if needed.
        </EmptyDescription>
      </EmptyHeader>
      {canSend && (
        <EmptyContent className="items-stretch">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              className="h-auto justify-start py-2 text-left whitespace-normal"
              onClick={() => send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </EmptyContent>
      )}
    </Empty>
  );
}

// ─── Messages ────────────────────────────────────────────────────────────────

/** One bubble on screen: stored, still sending, or a failure line. */
type Entry =
  | {
      kind: "message";
      key: string;
      side: "user" | "tibo";
      body: string;
      at: number;
      /** The stored message; absent while yours is still sending. */
      message?: TiboMessage;
      /** The other side's reaction. */
      reaction?: string;
      seen: boolean;
      replyTo?: TiboQuote;
    }
  | { kind: "error"; key: string; side: "tibo"; body: string; at: number }
  /** Your answer to actions Tibo held, centered after the message that asked. */
  | { kind: "notice"; key: string; side: "center"; at: number; confirm: TiboConfirm };

/** A bubble: anything but a notice. */
type BubbleEntry = Exclude<Entry, { kind: "notice" }>;

type Group = { key: string; side: "user" | "tibo" | "center"; day: string | null; entries: Entry[] };

const dayKey = (at: number) => new Date(at).toDateString();

/**
 * Bubbles grouped like a messaging app: back-to-back from one side within a
 * few minutes, never across midnight. A group that starts a new day carries
 * its day label, so loading older messages only ever adds groups above.
 */
function groupEntries(thread: TiboThreadState): Group[] {
  const entries: Entry[] = [
    ...thread.messages
      // App events (check-ins, relays) are for Tibo: relays read as plain chat.
      .filter((message) => message.role !== "system_event")
      .flatMap((message: TiboMessage): Entry[] => [
        {
          kind: "message",
          // A message you sent keeps its key from optimistic copy to stored row.
          key: message.clientId ?? message.id,
          side: message.role === "user" ? "user" : "tibo",
          body: message.body,
          at: message.createdAt,
          message,
          seen: message.seen === true,
          ...(message.reaction ? { reaction: message.reaction } : {}),
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        },
        ...(message.confirm && message.confirm.status !== "pending"
          ? [{ kind: "notice", key: `${message.id}:confirm`, side: "center", at: message.createdAt, confirm: message.confirm } as const]
          : []),
      ]),
    ...thread.pending.map(
      (pending): Entry => ({
        kind: "message",
        key: pending.clientId,
        side: "user",
        body: pending.body,
        at: pending.createdAt,
        seen: false,
        ...(pending.replyTo ? { replyTo: pending.replyTo } : {}),
      }),
    ),
  ];
  if (thread.errorBubble) {
    const { id, body, createdAt } = thread.errorBubble;
    entries.push({ kind: "error", key: id, side: "tibo", body, at: createdAt });
  }

  const groups: Group[] = [];
  let lastDay: string | null = null;
  for (const entry of entries) {
    const day = dayKey(entry.at);
    const last = groups.at(-1);
    const lastEntry = last?.entries.at(-1);
    if (
      last &&
      lastEntry &&
      entry.side !== "center" &&
      last.side === entry.side &&
      day === lastDay &&
      entry.at - lastEntry.at < GROUP_GAP_MS
    ) {
      last.entries.push(entry);
    } else {
      groups.push({ key: entry.key, side: entry.side, day: day === lastDay ? null : day, entries: [entry] });
    }
    lastDay = day;
  }
  return groups;
}

/** What a message can do once tapped. */
type EntryActions = {
  onReply: (message: TiboMessage) => void;
  onReact: (messageId: string, emoji: string | null) => void;
  onConfirm: (actionId: string, approve: boolean) => void;
};

function ThreadMessages({
  thread,
  loadOlder,
  ...actions
}: { thread: TiboThreadState; loadOlder: () => void } & EntryActions) {
  const groups = groupEntries(thread);
  // The newest bubble shows its time; a notice after it isn't a bubble.
  const latestKey = groups.findLast((group) => group.side !== "center")?.entries.at(-1)?.key;
  // The bubble you tapped: it shows its time, Reply, and reactions on Tibo's.
  const [selected, setSelected] = React.useState<string | null>(null);

  // Loading older messages keeps your place: the distance from the bottom
  // is kept across the prepend. Done here rather than by the scroller,
  // because older bubbles can join the top group, which changes its key.
  const viewport = React.useRef<HTMLDivElement>(null);
  const fromBottom = React.useRef<number | null>(null);
  const firstId = thread.messages[0]?.id;
  // Only the person's own scrolling loads more, not the jump to the
  // bottom on open (which passes the top first).
  const userScrolled = React.useRef(false);
  const markUserScroll = () => {
    userScrolled.current = true;
  };
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (!userScrolled.current || element.scrollTop >= LOAD_OLDER_PX) return;
    if (!thread.hasMore || thread.loadingOlder) return;
    fromBottom.current = element.scrollHeight - element.scrollTop;
    loadOlder();
  };
  React.useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || fromBottom.current === null || thread.loadingOlder) return;
    element.scrollTop = element.scrollHeight - fromBottom.current;
    fromBottom.current = null;
  }, [firstId, thread.loadingOlder]);

  return (
    <MessageScroller>
      {/* Outside the list, so the first message stays the first item and loading older keeps your place. */}
      {thread.loadingOlder && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center">
          <Spinner className="size-4 text-muted-foreground" />
        </div>
      )}
      <MessageScrollerViewport
        ref={viewport}
        aria-label="Messages with Tibo"
        preserveScrollOnPrepend={false}
        // Messages fade out under the floating header.
        className="scroll-fade [--scroll-fade-t-size:6rem]"
        onScroll={onScroll}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onKeyDown={markUserScroll}
        onPointerDown={markUserScroll}
      >
        {/* Narrow side margins on phones, so the bubbles get the room. */}
        <MessageScrollerContent aria-busy={thread.typing} className="gap-4 pt-24 pb-5 pr-3 pl-1 md:px-4">
          {groups.map((group, index) => (
            // Always laid out: a group can hold many bubbles, and the
            // scroller's offscreen placeholder height would break keeping
            // your place when older messages load.
            <MessageScrollerItem
              key={group.key}
              messageId={group.key}
              className="[content-visibility:visible]!"
            >
              {index === 0 && !thread.hasMore && (
                <p className="mb-4 text-center text-xs text-muted-foreground">This is where it all began.</p>
              )}
              {group.day && <DaySeparator at={group.entries[0]?.at ?? Date.now()} />}
              {group.side === "center" ? (
                group.entries.map((entry) => entry.kind === "notice" && <ConfirmNotice key={entry.key} confirm={entry.confirm} />)
              ) : (
                <GroupView
                  group={group}
                  latestKey={latestKey}
                  selected={selected}
                  select={(key) => setSelected((current) => (current === key ? null : key))}
                  {...actions}
                />
              )}
            </MessageScrollerItem>
          ))}
          {thread.typing && (
            <MessageScrollerItem messageId="typing">
              <TypingBubble />
            </MessageScrollerItem>
          )}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  );
}

/** Three dots in a small bubble of Tibo's, while it types the next one. */
function TypingBubble() {
  return (
    // Lined up with Tibo's bubbles, past the avatar column.
    <div role="status" aria-label="Tibo is typing" className="flex pl-9">
      <div className="flex h-8 items-center gap-1 rounded-full border border-bubble-tibo-border bg-bubble-tibo px-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden="true"
            className="size-1.5 animate-tibo-typing rounded-full bg-muted-foreground"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function DaySeparator({ at }: { at: number }) {
  return (
    <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
      <time dateTime={new Date(at).toISOString()}>{dayLabel(at)}</time>
    </p>
  );
}

/** "Today", "Yesterday", "Monday, Nov 2", or with the year when it isn't this one. */
function dayLabel(at: number) {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

const timeLabel = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Bubble corners: a group reads as one stack, so the corners facing the
 * sender's side tighten where bubbles meet.
 */
function cornerClass(side: "user" | "tibo", index: number, count: number) {
  if (count === 1) return "rounded-2xl";
  const first = index === 0;
  const last = index === count - 1;
  if (side === "tibo") {
    return cn("rounded-2xl", !first && "rounded-tl-md", !last && "rounded-bl-md");
  }
  return cn("rounded-2xl", !first && "rounded-tr-md", !last && "rounded-br-md");
}

function GroupView({
  group,
  latestKey,
  selected,
  select,
  ...actions
}: {
  group: Group;
  latestKey: string | undefined;
  selected: string | null;
  select: (key: string) => void;
} & EntryActions) {
  const tibo = group.side === "tibo";
  const side = tibo ? "tibo" : "user";
  return (
    <Message align={tibo ? "start" : "end"} className="items-end">
      {tibo && (
        <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
          <TiboMark idle={false} className="size-7" />
        </MessageAvatar>
      )}
      <MessageContent className={cn("gap-0.5", tibo ? "pr-8" : "pl-10")}>
        {group.entries.filter((entry): entry is BubbleEntry => entry.kind !== "notice").map((entry, index) => (
          <EntryView
            key={entry.key}
            entry={entry}
            corners={cornerClass(side, index, group.entries.length)}
            latest={entry.key === latestKey}
            selected={selected === entry.key}
            select={() => select(entry.key)}
            {...actions}
          />
        ))}
      </MessageContent>
    </Message>
  );
}

/** How far a bubble must be swiped right to reply to it. */
const SWIPE_REPLY_PX = 56;
/** The farthest a swiped bubble follows the finger. */
const SWIPE_MAX_PX = 80;

/**
 * Swipe right to reply: the bubble follows the finger (or mouse) sideways,
 * a reply arrow shows behind it, and letting go past the mark replies.
 * Vertical moves stay scrolls (`touch-action: pan-y`).
 */
function useSwipeToReply(onReply: (() => void) | null) {
  const [offset, setOffsetState] = React.useState(0);
  const current = React.useRef(0);
  const setOffset = (next: number) => {
    current.current = next;
    setOffsetState(next);
  };
  const start = React.useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const swiped = React.useRef(false);

  const handlers = onReply
    ? {
        onPointerDown: (event: React.PointerEvent) => {
          if (event.button !== 0) return;
          start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, horizontal: null };
          swiped.current = false;
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
          const from = start.current;
          if (!from || from.id !== event.pointerId) return;
          const dx = event.clientX - from.x;
          const dy = event.clientY - from.y;
          if (from.horizontal === null && Math.hypot(dx, dy) > 8) {
            from.horizontal = Math.abs(dx) > Math.abs(dy) && dx > 0;
            if (from.horizontal) {
              event.currentTarget.setPointerCapture(event.pointerId);
              // A swipe isn't a text selection.
              window.getSelection()?.removeAllRanges();
            }
          }
          if (from.horizontal) setOffset(Math.min(Math.max(dx, 0), SWIPE_MAX_PX));
        },
        onPointerUp: () => {
          const from = start.current;
          start.current = null;
          if (!from?.horizontal) return;
          swiped.current = true;
          const far = current.current >= SWIPE_REPLY_PX;
          setOffset(0);
          if (far) onReply();
        },
        onPointerCancel: () => {
          start.current = null;
          setOffset(0);
        },
      }
    : {};

  /** A click right after a swipe isn't a tap. */
  const wasSwipe = () => {
    const result = swiped.current;
    swiped.current = false;
    return result;
  };
  return { offset, handlers, wasSwipe };
}

function EntryView({
  entry,
  corners,
  latest,
  selected,
  select,
  onReply,
  onReact,
  onConfirm,
}: {
  entry: BubbleEntry;
  corners: string;
  latest: boolean;
  selected: boolean;
  select: () => void;
} & EntryActions) {
  const tibo = entry.side === "tibo";
  const message = entry.kind === "message" ? entry.message : undefined;
  const reaction = entry.kind === "message" ? entry.reaction : undefined;
  const sending = entry.kind === "message" && !message;
  const swipe = useSwipeToReply(message ? () => onReply(message) : null);

  return (
    <div
      id={message ? `tibo-message-${message.id}` : undefined}
      data-tibo-entry=""
      className={cn(
        "group/entry flex flex-col",
        tibo ? "items-start" : "items-end",
        sending && "opacity-60",
        // Room for the reaction hanging off the bubble's bottom edge.
        reaction && "mb-3",
      )}
    >
      <div className="relative flex w-full flex-col" style={{ alignItems: tibo ? "flex-start" : "flex-end" }}>
        {swipe.offset > 0 && (
          <ReplyIcon
            aria-hidden="true"
            className="absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground"
            style={{ opacity: Math.min(swipe.offset / SWIPE_REPLY_PX, 1) }}
          />
        )}
        <Bubble
          align={tibo ? "start" : "end"}
          variant="outline"
          className={cn(
            "max-w-[min(85%,32rem)] touch-pan-y",
            swipe.offset === 0 ? "transition-transform" : "select-none",
          )}
          style={{ transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined }}
          {...swipe.handlers}
        >
          <BubbleContent
            // A tap shows the time and what you can do with the message.
            onClick={() => {
              if (!swipe.wasSwipe() && entry.kind === "message") select();
            }}
            aria-expanded={entry.kind === "message" ? selected : undefined}
            className={cn(
              "cursor-default px-3.5 py-2 select-text",
              tibo
                ? "border-bubble-tibo-border! bg-bubble-tibo! text-bubble-tibo-foreground!"
                : // Room on the right for the tick in the bottom corner.
                  "relative border-transparent! bg-bubble-me! pr-9! whitespace-pre-wrap text-bubble-me-foreground!",
              corners,
            )}
          >
            {entry.kind === "message" && entry.replyTo && <QuoteView quote={entry.replyTo} mine={!tibo} />}
            {tibo ? (
              <Markdown>{entry.body}</Markdown>
            ) : (
              <>
                {entry.body}
                <Ticks sending={sending} seen={entry.kind === "message" && entry.seen} />
              </>
            )}
          </BubbleContent>
          {message && (
            // Another way to reply: beside the bubble on hover (or once tapped).
            <button
              type="button"
              aria-label="Reply"
              onClick={() => onReply(message)}
              className={cn(
                "absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity outline-none entry-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50",
                tibo ? "left-full ml-1" : "right-full mr-1",
                // Shown with the tapped message too. `entry-hover`, not
                // `group-hover`: see styles.css.
                selected && "opacity-100",
              )}
            >
              <ReplyIcon className="size-4" />
            </button>
          )}
          {reaction && (
            <BubbleReactions
              side="bottom"
              align={tibo ? "end" : "start"}
              aria-label={tibo ? `You reacted ${reaction}` : `Tibo reacted ${reaction}`}
              className="animate-star-pop ring-background"
            >
              {reaction}
            </BubbleReactions>
          )}
        </Bubble>
      </div>
      {tibo && message && (message.receipts || message.confirm) && (
        <TurnActions message={message} onConfirm={onConfirm} />
      )}
      {(latest || selected) && (
        <p className="px-1 pt-0.5 text-[0.6875rem] text-muted-foreground">
          {entry.kind === "error" ? (
            "Not saved. Nothing was charged."
          ) : sending ? (
            "Sending…"
          ) : (
            <time dateTime={new Date(entry.at).toISOString()}>{timeLabel(entry.at)}</time>
          )}
        </p>
      )}
      {selected && message && (
        <MessageActions
          message={message}
          reaction={tibo ? reaction : undefined}
          onReply={() => {
            onReply(message);
            select();
          }}
          onReact={(emoji) => {
            onReact(message.id, emoji === reaction ? null : emoji);
            select();
          }}
        />
      )}
    </div>
  );
}

/** One tick once your message is stored, two once Tibo has read it; in the bubble's corner. */
/**
 * Under the last bubble of a Tibo turn: the cards of what it changed, and
 * the actions it's holding for your go-ahead. Your answer shows as a
 * notice in the middle of the thread (`ConfirmNotice`).
 */
function TurnActions({
  message,
  onConfirm,
}: {
  message: TiboMessage;
  onConfirm: EntryActions["onConfirm"];
}) {
  const { confirm } = message;
  const receipts = shownReceipts(message.receipts ?? []);
  if (receipts.length === 0 && confirm?.status !== "pending") return null;
  return (
    <div className="flex w-full max-w-[min(85%,24rem)] flex-col gap-2 pt-1.5">
      {receipts.length > 0 && <TiboReceipts receipts={receipts} />}
      {confirm?.status === "pending" && <ConfirmCard confirm={confirm} onConfirm={onConfirm} />}
    </div>
  );
}

/** "Delete task: Gym" → what to do, and to what. */
const splitHeld = (text: string) => {
  const colon = text.indexOf(": ");
  return colon === -1 ? { action: text, target: null } : { action: text.slice(0, colon), target: text.slice(colon + 2) };
};

const KIND_ICON: Record<string, LucideIcon> = {
  task: SquareIcon,
  habit: CircleCheckIcon,
  goal: CircleCheckIcon,
  note: NotebookPenIcon,
  session: TimerIcon,
  tag: TagIcon,
};

/** The icon for a held action: a bin for deletes, a stop for stops, else the item's kind. */
const heldIcon = ({ text, item }: TiboHeldItem): LucideIcon =>
  text.startsWith("Delete") ? Trash2Icon : text.startsWith("Stop") ? SquareIcon : item ? (KIND_ICON[item.kind] ?? PencilIcon) : PencilIcon;

/**
 * What Tibo is holding, one row per action, with Cancel and Confirm side by
 * side across the bottom. Only a delete's or stop's icon is red. Both
 * buttons wait once one is tapped.
 */
function ConfirmCard({ confirm, onConfirm }: { confirm: TiboConfirm; onConfirm: EntryActions["onConfirm"] }) {
  const [answer, setAnswer] = React.useState<boolean | null>(null);
  const items = confirm.items.map(heldItem);
  const choose = (approve: boolean) => {
    setAnswer(approve);
    onConfirm(confirm.actionId, approve);
  };
  return (
    <div
      role="group"
      aria-label="Waiting for your go-ahead"
      className="w-full animate-in overflow-hidden rounded-2xl border border-bubble-tibo-border bg-bubble-tibo text-bubble-tibo-foreground shadow-sm fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
    >
      <p className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-1.5 text-xs font-medium text-muted-foreground">
        <HandIcon aria-hidden="true" className="size-3.5" />
        {items.length === 1 ? "Needs your go-ahead" : `${items.length} changes need your go-ahead`}
      </p>
      <ul className="flex flex-col px-1.5">
        {items.map((item, index) => {
          const Icon = heldIcon(item);
          const { action, target } = splitHeld(item.text);
          const danger = item.text.startsWith("Delete") || item.text.startsWith("Stop");
          return (
            <li key={index} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg",
                  danger ? "bg-destructive/10 text-destructive" : "bg-tibo-soft text-tibo-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-col text-sm leading-5">
                {target ? (
                  <>
                    <span className="text-xs text-muted-foreground">{action}</span>
                    <span className="font-medium wrap-break-word">{target}</span>
                  </>
                ) : (
                  <span className="font-medium wrap-break-word">{action}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 grid grid-cols-2 gap-2 border-t border-bubble-tibo-border bg-tibo-soft/40 p-2">
        <Button variant="outline" disabled={answer !== null} onClick={() => choose(false)}>
          {answer === false && <Spinner />}
          Cancel
        </Button>
        <Button disabled={answer !== null} onClick={() => choose(true)}>
          {answer === true && <Spinner />}
          Confirm
        </Button>
      </div>
    </div>
  );
}

const NOTICE: Record<Exclude<TiboConfirm["status"], "pending">, { icon: LucideIcon; label: string }> = {
  confirmed: { icon: CircleCheckIcon, label: "You confirmed" },
  cancelled: { icon: CircleXIcon, label: "You cancelled" },
  expired: { icon: ClockIcon, label: "Expired before you answered" },
};

/** Your answer to held actions, in the middle of the thread like an app event. */
function ConfirmNotice({ confirm }: { confirm: TiboConfirm }) {
  if (confirm.status === "pending") return null;
  const { icon: Icon, label } = NOTICE[confirm.status];
  const items = confirm.items.map((item) => heldItem(item).text);
  return (
    <div role="status" className="mx-auto my-1 flex max-w-[85%] flex-col items-center gap-1 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      {items.map((item, index) => (
        <span key={index} className="text-xs text-muted-foreground">
          {item}
        </span>
      ))}
      {confirm.status !== "confirmed" && <span className="text-xs text-muted-foreground">Nothing changed.</span>}
    </div>
  );
}

function Ticks({ sending, seen }: { sending: boolean; seen: boolean }) {
  const Icon = sending ? ClockIcon : seen ? CheckCheckIcon : CheckIcon;
  return (
    <span
      role="img"
      aria-label={sending ? "Sending" : seen ? "Seen" : "Sent"}
      className={cn(
        // The bubble's bottom-right corner, like a messaging app.
        "absolute right-2.5 bottom-1.5 inline-flex",
        seen ? "text-tick-seen" : "text-bubble-me-foreground/60",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/** The message a reply quotes, at the top of the reply's bubble. Tap to find it. */
function QuoteView({ quote, mine }: { quote: TiboQuote; mine: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        document
          .getElementById(`tibo-message-${quote.id}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }}
      className={cn(
        "mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs whitespace-normal",
        mine ? "border-bubble-me-foreground/50 bg-bubble-me-foreground/10" : "border-muted-foreground/40 bg-muted/60",
      )}
    >
      <span className="block font-medium">{quote.role === "tibo" ? "Tibo" : "You"}</span>
      <span className="line-clamp-2 opacity-80">{quote.body}</span>
    </button>
  );
}

/** Under a tapped message: Reply, and quick reactions on Tibo's. */
function MessageActions({
  message,
  reaction,
  onReply,
  onReact,
}: {
  message: TiboMessage;
  reaction: string | undefined;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-0.5 rounded-full border bg-popover p-0.5 shadow-sm">
      {message.role === "tibo" &&
        TIBO_QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`React ${emoji}`}
            aria-pressed={reaction === emoji}
            onClick={() => onReact(emoji)}
            className="grid size-8 place-items-center rounded-full text-base transition-transform outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted"
          >
            {emoji}
          </button>
        ))}
      <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={onReply}>
        <ReplyIcon />
        Reply
      </Button>
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({
  thread,
  send,
  replyTo,
  clearReply,
}: {
  thread: TiboThreadState;
  send: (text: string, replyTo?: TiboMessage) => boolean;
  replyTo: TiboMessage | null;
  clearReply: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  const textarea = React.useRef<HTMLTextAreaElement>(null);
  // Mid-reply is fine: the message waits, and Tibo answers it next.
  const canSend = draft.trim().length > 0 && thread.connected;
  const low = thread.usage && thread.usage.remaining < TIBO_LOW_USAGE ? thread.usage.remaining : null;
  // A line under the box: only when there's something to say.
  const hint = !thread.connected ? "Reconnecting…" : low !== null ? `${low} ${low === 1 ? "message" : "messages"} left this month` : null;

  // Picking a message to reply to puts you in the message box.
  React.useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend && send(draft, replyTo ?? undefined)) {
      setDraft("");
      clearReply();
    }
  };

  return (
    <>
      {thread.notice && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {thread.notice}
        </p>
      )}
      <form ref={formRef} onSubmit={onSubmit}>
        <InputGroup className="rounded-2xl! border-composer-border! bg-composer!">
          {replyTo && (
            <InputGroupAddon align="block-start" className="pb-0 font-normal">
              {/* Solid and full-contrast: the addon's muted, translucent defaults read as blurry here. */}
              <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border-l-[3px] border-primary bg-muted py-1.5 pr-1 pl-2.5">
                <div className="min-w-0 flex-1 text-xs leading-snug">
                  <p className="font-semibold text-primary">
                    Replying to {replyTo.role === "tibo" ? "Tibo" : "yourself"}
                  </p>
                  <p className="truncate text-foreground/85">{replyTo.body}</p>
                </div>
                <InputGroupButton size="icon-xs" aria-label="Cancel reply" onClick={clearReply}>
                  <XIcon />
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          )}
          <InputGroupTextarea
            ref={textarea}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message Tibo…"
            aria-label="Message"
            // Message-sized text (the base textarea is 16px on phones).
            className={cn("max-h-40 min-h-12 py-3 text-sm md:min-h-12", !hint && "pr-12")}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            onKeyDown={(event) => {
              if (event.key === "Escape" && replyTo) {
                event.preventDefault();
                clearReply();
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
          {/*
            With no hint line, Send floats in the box's corner so the box
            stays one row tall.
          */}
          <InputGroupAddon
            align="block-end"
            className={cn("pt-0 pb-1.5", !hint && "absolute right-0 bottom-0 w-auto p-2")}
          >
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            {/*
              `aria-disabled`, not `disabled`: the input group fades itself to
              half opacity whenever it holds a disabled control, which made the
              whole box (and the reply bar) look washed out while empty.
            */}
            {/* Just the icon, no fill: in the ink color, dimmed while there's nothing to send. */}
            <InputGroupButton
              type="submit"
              variant="ghost"
              size="icon-sm"
              className="ml-auto rounded-full text-primary hover:bg-primary/10 hover:text-primary aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:opacity-60"
              aria-label="Send"
              aria-disabled={!canSend}
            >
              {/* Sized on the icon: the button's own icon rule beats a class on the button. */}
              <SendIcon className="size-5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </>
  );
}

/**
 * Shown instead of the composer when the month's AI messages are used up.
 * Laid out like Tibo's words, but built here only: never sent to the model
 * or kept in the thread.
 */
function LimitNotice({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Message role="status" aria-live="polite">
      <MessageContent className="gap-1.5">
        <p className="text-sm leading-relaxed">
          You've used all your messages with me this month. More usage is coming soon!
        </p>
        <p className="text-xs text-muted-foreground">
          System message.{" "}
          <Link
            to="/settings"
            search={{ tab: "tibo" }}
            onClick={onNavigate}
            className="underline underline-offset-2 hover:text-foreground"
          >
            See your usage
          </Link>
        </p>
      </MessageContent>
    </Message>
  );
}
