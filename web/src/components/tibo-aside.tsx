import type { CSSProperties, ReactNode } from "react";
import { TiboMark } from "@/components/tibo-mark";
import { cn } from "@/lib/utils";

/** Tibo, talking: beside the content on wide screens (landing, sign-in, onboarding), below it on phones. */
export function TiboAside({
  label,
  status = "Active now",
  typing = false,
  children,
}: {
  label: string;
  status?: string;
  typing?: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className="relative mx-auto flex w-full max-w-md flex-col justify-end gap-5 overflow-hidden rounded-[1.75rem] border bg-card p-6 pt-20 shadow-(--card-shadow) sm:p-8 sm:pt-24 lg:mx-0 lg:min-h-[34rem] lg:max-w-none lg:gap-6 lg:rounded-[2rem] lg:p-10 lg:pt-10"
    >
      <TiboMark
        idle={false}
        className="pointer-events-none absolute -top-24 -right-24 size-72 opacity-[0.07] lg:-top-40 lg:-right-40 lg:size-[30rem] dark:opacity-[0.22]"
      />
      <div className="relative flex items-center gap-3">
        <span className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1 shadow-sm">
          <TiboMark idle={typing} className="size-11" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-lg font-semibold">Tibo</span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
            {typing ? "Typing" : status}
          </span>
        </span>
      </div>
      <div className="relative flex flex-col gap-6">{children}</div>
    </aside>
  );
}

/** One of Tibo's chat bubbles. `delay` staggers the page-load entrance, in milliseconds. */
export function TiboBubble({
  delay,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties | undefined = delay === undefined ? undefined : { animationDelay: `${delay}ms` };
  return (
    <p
      style={style}
      className={cn(
        "w-fit max-w-[34ch] animate-in rounded-2xl rounded-bl-md border border-bubble-tibo-border bg-bubble-tibo px-4 py-2.5 leading-relaxed text-pretty text-bubble-tibo-foreground fill-mode-both fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function TiboTyping() {
  return (
    <span
      role="status"
      aria-label="Tibo is typing"
      className="flex h-9 w-fit items-center gap-1 rounded-full border border-bubble-tibo-border bg-bubble-tibo px-3.5"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="size-1.5 animate-tibo-typing rounded-full bg-muted-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
