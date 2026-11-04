import { ASK_QUESTION_MAX_LENGTH, type AskPage, type Person } from "@dueboard/api/rpc";
import type { AskExchange } from "@dueboard/api/ask";
import { Link } from "@tanstack/react-router";
import { SendIcon, UserRoundIcon } from "lucide-react";
import * as React from "react";
import { Markdown } from "@/components/markdown";
import { TiboMark } from "@/components/tibo-mark";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
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
import { useAskThread, type AskError } from "@/hooks/use-ask";
import { loadTurnstile, type TurnstileApi } from "@/lib/turnstile";
import { cn } from "@/lib/utils";

export function AskThread({
  page,
  signedIn,
  headerEnd,
  className,
}: {
  page: AskPage;
  signedIn: boolean;
  headerEnd?: React.ReactNode;
  className?: string;
}) {
  const { person } = page;
  const { state, pending, ask } = useAskThread(person.username, page.available);
  const [error, setError] = React.useState<AskError | null>(null);
  const [waiting, setWaiting] = React.useState<string | null>(null);
  const [check, setCheck] = React.useState(0);
  const [draft, setDraft] = React.useState("");

  const send = async (question: string, token?: string) => {
    setError(null);
    setDraft("");
    const result = await ask(question, token);
    if (result.ok) {
      setWaiting(null);
      return;
    }
    setDraft((current) => current || question);
    if (result.error === "verify") {
      setWaiting(question);
      setCheck((n) => n + 1);
    } else {
      setWaiting(null);
      setError(result.error);
    }
  };

  const submit = (question: string) => {
    if (state.status !== "ready" || pending !== null) return;
    if (question.length > ASK_QUESTION_MAX_LENGTH) return setError("invalid");
    if (state.needsVerification) {
      setError(null);
      setWaiting(question);
      setCheck((n) => n + 1);
      return;
    }
    void send(question);
  };

  const exchanges = state.status === "ready" ? state.exchanges : [];
  return (
    <section
      aria-label={`Ask ${person.name}`}
      className={cn("relative flex flex-col overflow-hidden text-card-foreground", className)}
    >
      <MessageScrollerProvider autoScroll>
        <AskHeader person={person} typing={pending !== null} headerEnd={headerEnd} />
        <div className="min-h-0 flex-1">
          {state.status === "loading" ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading…
            </div>
          ) : state.status === "failed" ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Couldn't load your questions. Reload the page to try again.
            </div>
          ) : exchanges.length === 0 && pending === null ? (
            <AskEmpty person={person} />
          ) : (
            <AskMessages exchanges={exchanges} pending={pending} />
          )}
        </div>
        <div className="flex flex-col gap-2 px-3 pt-2 pb-3 md:mx-auto md:w-1/2 md:px-0">
          {waiting !== null && state.status === "ready" && (
            <TurnstileCheck key={check} siteKey={state.siteKey} onToken={(token) => void send(waiting, token)} />
          )}
          {error && (
            <p role="alert" className="px-1 text-xs text-destructive">
              {ERROR_LINE[error]}
            </p>
          )}
          <AskComposer
            name={firstName(person)}
            draft={draft}
            setDraft={setDraft}
            disabled={state.status !== "ready" || pending !== null || waiting !== null}
            onSubmit={submit}
          />
          <p className="px-1 text-center text-[0.6875rem] text-muted-foreground">
            {page.self
              ? page.enabled
                ? "Your Ask page, as visitors see it. Your test questions use your own requests."
                : "Your Ask page is off, so only you can see it. Your test questions use your own requests."
              : `Tibo is an AI answering for ${firstName(person)} from what they shared. It can be wrong. ${firstName(person)} can read your questions.${signedIn ? " Each answer uses one of your requests." : ""}`}
          </p>
        </div>
      </MessageScrollerProvider>
    </section>
  );
}

const firstName = (person: Person) => person.name.trim().split(/\s+/)[0] || `@${person.username}`;

const ERROR_LINE: Record<AskError, string> = {
  off: "This Ask page isn't available right now.",
  unavailable: "Answers are unavailable right now. Try again later.",
  quota: "You've used your AI requests for this month. They come back when your month resets.",
  limited: "You've asked a lot in a short time. Try again later.",
  verify: "The check didn't pass. Try it again.",
  invalid: `Write a question of up to ${ASK_QUESTION_MAX_LENGTH} characters.`,
  busy: "Still answering your last question.",
  network: "Couldn't send your question. Check your connection and try again.",
};

function AskHeader({ person, typing, headerEnd }: { person: Person; typing: boolean; headerEnd?: React.ReactNode }) {
  const [spins, setSpins] = React.useState(0);
  React.useEffect(() => {
    if (typing) setSpins((n) => n + 1);
  }, [typing]);
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3">
      <div className="flex flex-col items-center">
        <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1 shadow-lg">
          <TiboMark spin={spins} className="size-11" />
        </div>
        <div className="-mt-2 flex flex-col items-center rounded-2xl border border-bubble-tibo-border bg-bubble-tibo px-3.5 py-0.5 text-bubble-tibo-foreground shadow-md">
          <h2 className="text-[0.9375rem] leading-snug font-semibold">Tibo</h2>
          <p aria-live="polite" className="-mt-0.5 pb-0.5 text-[0.6875rem] leading-tight text-muted-foreground">
            {typing ? "typing…" : `Answers for @${person.username}`}
          </p>
        </div>
      </div>
      {headerEnd && (
        <div className="pointer-events-auto absolute top-3 right-3 flex items-center gap-2">{headerEnd}</div>
      )}
    </header>
  );
}

export function HeaderPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-full border border-bubble-tibo-border bg-bubble-tibo shadow-md", className)}>
      {children}
    </div>
  );
}

export function ProfileButton({ person }: { person: Person }) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-8 rounded-full px-3 font-medium text-primary hover:bg-primary/10 hover:text-primary"
    >
      <Link to="/@{$username}" params={{ username: person.username }}>
        <UserRoundIcon />
        <span className="max-sm:sr-only">{firstName(person)}'s profile</span>
      </Link>
    </Button>
  );
}

function AskEmpty({ person }: { person: Person }) {
  const name = firstName(person);
  return (
    <Empty className="h-full pt-24">
      <EmptyHeader>
        <EmptyMedia>
          <TiboMark className="size-12" />
        </EmptyMedia>
        <EmptyTitle>Ask me about {name}</EmptyTitle>
        <EmptyDescription>
          I'm Tibo, an AI answering for @{person.username}. I only know what {name} wrote for me, so if they didn't
          cover something, I'll say so.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function AskMessages({ exchanges, pending }: { exchanges: readonly AskExchange[]; pending: string | null }) {
  return (
    <MessageScroller className="h-full">
      <MessageScrollerViewport
        aria-label="Questions and answers"
        className="scroll-fade [--scroll-fade-t-size:6rem]"
      >
        <MessageScrollerContent aria-busy={pending !== null} className="gap-4 pt-24 pb-5 pr-3 pl-1 md:px-4">
          {exchanges.map((exchange) => (
            <MessageScrollerItem key={exchange.id} messageId={exchange.id} className="flex flex-col gap-4">
              <Question text={exchange.question} />
              <Answer text={exchange.answer} />
            </MessageScrollerItem>
          ))}
          {pending !== null && (
            <MessageScrollerItem messageId="pending" className="flex flex-col gap-4">
              <Question text={pending} sending />
              <TypingBubble />
            </MessageScrollerItem>
          )}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  );
}

function Question({ text, sending = false }: { text: string; sending?: boolean }) {
  return (
    <Message align="end" className={cn("items-end", sending && "opacity-60")}>
      <MessageContent className="pl-10">
        <Bubble align="end" variant="outline" className="max-w-[min(85%,32rem)]">
          <BubbleContent className="rounded-2xl border-transparent! bg-bubble-me! px-3.5 py-2 whitespace-pre-wrap text-bubble-me-foreground!">
            {text}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function Answer({ text }: { text: string }) {
  return (
    <Message align="start" className="items-end">
      <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
        <TiboMark idle={false} className="size-7" />
      </MessageAvatar>
      <MessageContent className="pr-8">
        <Bubble align="start" variant="outline" className="max-w-[min(85%,32rem)]">
          <BubbleContent className="rounded-2xl border-bubble-tibo-border! bg-bubble-tibo! px-3.5 py-2 text-bubble-tibo-foreground!">
            <Markdown>{text}</Markdown>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function TypingBubble() {
  return (
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

function AskComposer({
  name,
  draft,
  setDraft,
  disabled,
  onSubmit,
}: {
  name: string;
  draft: string;
  setDraft: (value: string) => void;
  disabled: boolean;
  onSubmit: (question: string) => void;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const question = draft.trim();
  const over = draft.length > ASK_QUESTION_MAX_LENGTH;
  const canSend = question.length > 0 && !over && !disabled;
  const near = draft.length > ASK_QUESTION_MAX_LENGTH - 80;
  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit(question);
      }}
    >
      <InputGroup className="rounded-2xl! border-composer-border! bg-composer!">
        <InputGroupTextarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Ask about ${name}…`}
          aria-label={`Your question about ${name}`}
          aria-invalid={over || undefined}
          className={cn("max-h-40 min-h-12 py-3 text-sm md:min-h-12", !near && "pr-12")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <InputGroupAddon align="block-end" className={cn("pt-0 pb-1.5", !near && "absolute right-0 bottom-0 w-auto p-2")}>
          {near && (
            <span className={cn("text-xs text-muted-foreground tabular-nums", over && "text-destructive")}>
              {draft.length}/{ASK_QUESTION_MAX_LENGTH}
            </span>
          )}
          <InputGroupButton
            type="submit"
            variant="ghost"
            size="icon-sm"
            className="ml-auto rounded-full text-primary hover:bg-primary/10 hover:text-primary aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:opacity-60"
            aria-label="Ask"
            aria-disabled={!canSend}
          >
            <SendIcon className="size-5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

function TurnstileCheck({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = React.useRef<HTMLDivElement>(null);
  const callback = React.useRef(onToken);
  callback.current = onToken;
  const [failed, setFailed] = React.useState(false);
  const [passed, setPassed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let api: TurnstileApi | null = null;
    let widget: string | null = null;
    let cancelled = false;
    setFailed(false);
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        api = turnstile;
        widget = turnstile.render(container.current, {
          sitekey: siteKey,
          action: "ask",
          theme: "auto",
          size: "flexible",
          callback: (token) => {
            if (widget && api) api.remove(widget);
            widget = null;
            setPassed(true);
            callback.current(token);
          },
          "error-callback": () => setFailed(true),
          "expired-callback": () => {
            if (widget && api) api.reset(widget);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widget && api) api.remove(widget);
    };
  }, [siteKey, attempt]);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-bubble-tibo-border bg-bubble-tibo p-3 text-sm text-bubble-tibo-foreground">
      <p className="text-muted-foreground">
        {passed ? "Thanks, sending your question." : "A quick check before your first question, to keep bots out."}
      </p>
      <div ref={container} className={cn(!passed && "min-h-16")} />
      {failed && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-destructive">The check didn't load or didn't pass.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Try the check again
          </Button>
        </div>
      )}
    </div>
  );
}
