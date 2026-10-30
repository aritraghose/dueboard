import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { useAgent } from "agents/react";
import {
  ArrowUpIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  MessageCircleDashedIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { Markdown } from "@/components/markdown";
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
 * Chat with the Dueboard assistant (`api/src/agent.ts`). Each user has one
 * conversation, kept by the agent, so it is still here after a reload or on
 * another device. Renders only in the browser: it opens a WebSocket.
 */
export function AgentChat({ userId }: { userId: string }) {
  return (
    <section
      aria-label="Assistant"
      className="flex h-[min(40rem,75dvh)] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground"
    >
      <React.Suspense fallback={<ChatLoading />}>
        <ChatThread userId={userId} />
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

function ChatThread({ userId }: { userId: string }) {
  // The web stack's `/agents/*` proxy pins the instance to the signed-in user,
  // whatever name is sent; this one just matches it.
  const agent = useAgent({ agent: "ChatAgent", name: userId });
  const { messages, sendMessage, clearHistory, stop, status, error, isRecovering } = useAgentChat({
    agent,
  });
  const [draft, setDraft] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);

  const busy = status === "submitted" || status === "streaming" || isRecovering;
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
    if (window.confirm("Clear this conversation? The assistant forgets it too.")) {
      clearHistory();
    }
  };

  return (
    <MessageScrollerProvider autoScroll>
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-heading font-semibold">Assistant</h2>
          <p className="truncate text-xs text-muted-foreground">
            Plans, priorities and next steps for what's due.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Clear conversation"
              onClick={clear}
              disabled={busy || messages.length === 0}
            >
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear conversation</TooltipContent>
        </Tooltip>
      </header>

      <div className="min-h-0 flex-1">
        {messages.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleDashedIcon />
              </EmptyMedia>
              <EmptyTitle>What's on your plate?</EmptyTitle>
              <EmptyDescription>
                Tell the assistant what's due, and it will help you decide what to do first.
              </EmptyDescription>
            </EmptyHeader>
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
        {error && !busy && (
          <Alert variant="destructive">
            <AlertTitle>The assistant couldn't reply</AlertTitle>
            <AlertDescription>{error.message || "Send your message again."}</AlertDescription>
          </Alert>
        )}
        <form ref={formRef} onSubmit={onSubmit}>
          <InputGroup>
            <InputGroupTextarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about what's due…"
              aria-label="Message"
              className="max-h-40 min-h-14"
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
      </div>
    </MessageScrollerProvider>
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
            <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
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
