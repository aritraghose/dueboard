import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** The title block every `_app` list page starts with. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-title font-semibold">{title}</h1>
        {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      </div>
      {children}
    </header>
  );
}

/**
 * The empty state of a page whose contents arrive in a later build step:
 * what the page will hold, in the user's words. It fills the page, with no
 * card behind it.
 */
export function PageEmpty({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("min-h-80 flex-1", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 rounded-xl">
          <Icon className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

/**
 * A list page: header plus content, filling the whole space. The app's
 * margins are thin (so cards reach the edges); pages pad their own text.
 */
export function Page({ children }: { children: ReactNode }) {
  return <main className="flex w-full flex-1 flex-col gap-6 px-3 pt-3 md:px-6 md:pt-4">{children}</main>;
}
