import { SocialStatus, type Person } from "@dueboard/api/rpc";
import { UsersRoundIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ConnectionActions } from "@/components/connection-actions";
import { PersonRow } from "@/components/people-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// The pieces `/discover`, `/connections` and Settings share to list people:
// a titled section in a card, and a list of people with their actions.

/**
 * A titled list of people in a card: the title (with a count when there
 * are any) on the left and `action` on the right of one row, then the card.
 * `bare` drops the card, for content that draws its own (the search).
 */
export function PeopleSection({
  title,
  description,
  count,
  action,
  bare = false,
  children,
}: {
  title: ReactNode;
  description?: string;
  count?: number;
  action?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold max-md:text-sm">
            {title}
            {count !== undefined && count > 0 && (
              <span className="rounded-full bg-tibo-soft px-2 py-px text-[0.6875rem] font-medium text-tibo-foreground tabular-nums">
                {count}
              </span>
            )}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {bare ? (
        children
      ) : (
        <div className="rounded-2xl border bg-card px-3 py-1 shadow-(--card-shadow) md:px-4">{children}</div>
      )}
    </section>
  );
}

/** Placeholder rows while people load. */
export function PeopleSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="divide-y">
      {Array.from({ length: rows }, (_, row) => (
        <li key={row} className="flex items-center gap-3 py-3">
          <Skeleton className="size-10 rounded-full bg-tibo-soft max-md:size-9" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5 bg-tibo-soft", row % 2 === 0 ? "w-36" : "w-28")} />
            <Skeleton className="h-3 w-20 bg-tibo-soft" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg bg-tibo-soft max-md:h-7 max-md:w-16" />
        </li>
      ))}
    </ul>
  );
}

/** People with the viewer's status toward each, as `ConnectionActions` rows. */
export function PeopleList({
  people,
  empty,
}: {
  people:
    | readonly { readonly key: string; readonly person: Person; readonly status: SocialStatus }[]
    | undefined;
  empty: string;
}) {
  if (!people) return <PeopleSkeleton />;
  if (people.length === 0) {
    return (
      <div className="flex items-center gap-3 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tibo-soft text-tibo-foreground max-md:size-9">
          <UsersRoundIcon aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground max-md:text-[0.8125rem]">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {people.map(({ key, person, status }) => (
        <PersonRow key={key} person={person}>
          <ConnectionActions username={person.username} status={status} compact />
        </PersonRow>
      ))}
    </ul>
  );
}

/** "Couldn't load …" with a retry, inside a section. */
export function PeopleLoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <p className="text-sm text-muted-foreground">Couldn't load {what}.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export const statusOf = (state: SocialStatus["state"], requestId: string | null = null) =>
  new SocialStatus({ state, requestId });
