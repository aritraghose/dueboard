import { SocialStatus, type Person } from "@dueboard/api/rpc";
import type { ReactNode } from "react";
import { ConnectionActions } from "@/components/connection-actions";
import { PersonRow } from "@/components/people-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// The pieces `/discover`, `/connections` and Settings share to list people:
// a titled section in a card, and a list of people with their actions.

/** A titled list of people in a card, with a count when there are any. */
export function PeopleSection({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="flex items-baseline gap-2 font-medium">
          {title}
          {count !== undefined && count > 0 && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
          )}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-xl border bg-card px-4 py-1 shadow-(--card-shadow)">{children}</div>
    </section>
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
  if (!people) {
    return (
      <div className="flex items-center gap-3 py-3" aria-hidden="true">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }
  if (people.length === 0) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>;
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
