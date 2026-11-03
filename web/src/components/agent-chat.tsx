import { useAgentChat } from "@cloudflare/ai-chat/react";
import { MAX_CHAT_MESSAGE_LENGTH } from "@dueboard/api/limits";
import { AI_LIMIT_REACHED, type AiUsage } from "@dueboard/api/rpc";
import { Link } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { useAgent } from "agents/react";
import {
  ArrowUpIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { Markdown } from "@/components/markdown";
import { TiboMark } from "@/components/tibo-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiUsage, usageLine } from "@/hooks/use-ai-usage";
import { useTibo } from "@/hooks/use-tibo";
import { cn } from "@/lib/utils";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

const SUGGESTIONS = [
  "Help me plan this week around my deadlines.",
  "Break a big assignment into steps I can finish.",
  "What should I do first when everything is due at once?",
];

/**
 * Chat with Tibo. Until step 17 this is the demo `ChatAgent`
 * (`api/src/agent.ts`). Each user has one conversation, kept by the agent, so
 * it is still here after a reload or on another device. Renders only in the
 * browser: it opens a WebSocket. Shown in the Tibo side panel and on `/inbox`;
 * `headerEnd` adds controls (the panel's close button) to its header.
 */
export function AgentChat({
  userId,
  className,
  headerEnd,
}: {
  userId: string;
  className?: string;
  headerEnd?: React.ReactNode;
}) {
  return (
    <section
      aria-label="Tibo"
      className={cn(
        "flex h-[min(40rem,75dvh)] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
        className,
      )}
    >
      <React.Suspense fallback={<ChatLoading />}>
        <ChatThread userId={userId} headerEnd={headerEnd} />
      </React.Suspense>
    </section>
  );
}

function ChatLoading() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      Loading your chat…
    </div>
  );
}

function ChatThread({ userId, headerEnd }: { userId: string; headerEnd?: React.ReactNode }) {
  // The web stack's `/agents/*` proxy pins the instance to the signed-in user,
  // whatever name is sent; this one just matches it.
  const agent = useAgent({ agent: "ChatAgent", name: userId });
  const { messages, sendMessage, clearHistory, stop, status, error, isRecovering } = useAgentChat({
    agent,
  });
  const [draft, setDraft] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  const { usage, refresh: refreshUsage } = useAiUsage();

  const busy = status === "submitted" || status === "streaming" || isRecovering;
  // Out of AI messages this month: the agent refused the turn, or the count
  // says so. The composer gives way to a notice that lives only here.
  const limitReached = error?.message === AI_LIMIT_REACHED || usage?.remaining === 0;

  // Each turn may have spent a message: count again once it ends.
  const wasBusy = React.useRef(busy);
  React.useEffect(() => {
    if (wasBusy.current && !busy) refreshUsage();
    wasBusy.current = busy;
  }, [busy, refreshUsage]);
  const canSend = draft.trim().length > 0 && !busy;
  const last = messages.at(-1);
  // The reply hasn't produced a part yet: show that the agent is working.
  const waiting = busy && last?.role === "user";

  const send = (text: string) => {
    void sendMessage({ text: text.trim() });
    setDraft("");
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) send(draft);
  };

  const clear = () => {
    if (window.confirm("Clear this conversation? Tibo forgets it too.")) {
      clearHistory();
    }
  };

  return (
    <MessageScrollerProvider autoScroll>
      {/* Like every card's title, Tibo's sits in the middle. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b px-4 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="justify-self-start"
              aria-label="Clear conversation"
              onClick={clear}
              disabled={busy || messages.length === 0}
            >
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear conversation</TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 items-center gap-2.5">
          <TiboMark className="size-8" />
          <div className="flex min-w-0 flex-col">
            <h2 className="font-heading font-semibold">Tibo</h2>
            <p className="truncate text-xs text-muted-foreground max-sm:hidden">
              Plans, priorities and the occasional pep talk.
            </p>
          </div>
        </div>
        <div className="flex justify-end">{headerEnd}</div>
      </header>

      <div className="min-h-0 flex-1">
        {messages.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia>
                <TiboMark className="size-12" />
              </EmptyMedia>
              <EmptyTitle>What's on your plate?</EmptyTitle>
              <EmptyDescription>
                Tell Tibo what's due, and it will help you decide what to do first.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className={cn("items-stretch", limitReached && "hidden")}>
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
          </Empty>
        ) : (
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent aria-busy={busy} className="px-4 py-5">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <ChatMessage message={message} streaming={busy && message === last} />
                  </MessageScrollerItem>
                ))}
                {waiting && (
                  <MessageScrollerItem messageId="pending">
                    <TraceLine status="running">
                      <TraceIcon>
                        <LoaderCircleIcon className="animate-spin" />
                      </TraceIcon>
                      <TraceTitle>Thinking</TraceTitle>
                    </TraceLine>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4 pt-2">
        {limitReached && !busy ? (
          <LimitNotice />
        ) : (
          <Composer
            formRef={formRef}
            draft={draft}
            setDraft={setDraft}
            onSubmit={onSubmit}
            busy={busy}
            canSend={canSend}
            stop={stop}
            error={error}
            usage={usage}
          />
        )}
      </div>
    </MessageScrollerProvider>
  );
}

function Composer({
  formRef,
  draft,
  setDraft,
  onSubmit,
  busy,
  canSend,
  stop,
  error,
  usage,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  draft: string;
  setDraft: (draft: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  canSend: boolean;
  stop: () => unknown;
  error: Error | undefined;
  usage: AiUsage | undefined;
}) {
  return (
    <>
      {error && !busy && (
        <Alert variant="destructive">
          <AlertTitle>Tibo couldn't reply</AlertTitle>
          <AlertDescription>{error.message || "Send your message again."}</AlertDescription>
        </Alert>
      )}
      <form ref={formRef} onSubmit={onSubmit}>
        <InputGroup className="border-composer-border!">
          <InputGroupTextarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message Tibo…"
            aria-label="Message"
            className="max-h-40 min-h-14"
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="pt-1">
            <span className="text-xs text-muted-foreground max-sm:hidden">
              Enter to send, Shift+Enter for a new line
            </span>
            {busy ? (
              <InputGroupButton
                type="button"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="Stop reply"
                onClick={() => void stop()}
              >
                <SquareIcon className="fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="Send"
                disabled={!canSend}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
      {usage && (
        <p className="-mt-1.5 px-1 text-right text-xs text-muted-foreground">{usageLine(usage)}</p>
      )}
    </>
  );
}

/**
 * Shown instead of the composer when the month's AI messages are used up.
 * Laid out like Tibo's replies, but built here only: never sent to the
 * model or kept in the thread.
 */
function LimitNotice() {
  const { setOpen } = useTibo();
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
            onClick={() => setOpen(false)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            See your usage
          </Link>
        </p>
      </MessageContent>
    </Message>
  );
}

function ChatMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const text = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent className="bg-bubble-me! whitespace-pre-wrap text-bubble-me-foreground!">
              {text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  const reasoning = message.parts.flatMap((part) => (part.type === "reasoning" ? [part] : []));

  return (
    <Message>
      <MessageContent className="gap-3">
        {reasoning.length > 0 && (
          <Trace>
            {reasoning.map((part, index) => (
              <ReasoningRow key={index} text={part.text} running={part.state === "streaming"} />
            ))}
          </Trace>
        )}
        {/* Tibo's replies are plain text on the panel; only yours sit in a bubble. */}
        {text && <Markdown streaming={streaming}>{text}</Markdown>}
      </MessageContent>
    </Message>
  );
}

function ReasoningRow({ text, running }: { text: string; running: boolean }) {
  // Open while the model is thinking, then collapse, unless the person
  // toggled it themselves.
  const [open, setOpen] = React.useState<boolean>();

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>
            {running ? <LoaderCircleIcon className="animate-spin" /> : <CircleCheckIcon />}
          </TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">{text}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
