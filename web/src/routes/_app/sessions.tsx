import type { FocusSession } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Exit from "effect/Exit";
import { TimerIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SessionList } from "@/components/focus-session";
import { Page, PageEmpty, PageHeader } from "@/components/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { sessionListAtom, useIsSessionRemoved, useSessionActions } from "@/hooks/use-sessions";
import { failureMessage } from "@/hooks/use-tasks";
import { type LocalDate, formatDay, formatDayLong, relativeDay } from "@/lib/dates";
import { formatFocused, formatMinutes, sessionName } from "@/lib/sessions";

type SessionsSearch = {
  /** Only completed or only stopped sessions. Absent means all. */
  status?: "completed" | "stopped" | undefined;
};

const PAGE_SIZE = 30;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "stopped", label: "Stopped" },
] as const;

export const Route = createFileRoute("/_app/sessions")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): SessionsSearch => ({
    status: search.status === "completed" || search.status === "stopped" ? search.status : undefined,
  }),
  head: () => ({ meta: [{ title: "Sessions · Dueboard" }] }),
  component: Sessions,
});

function Sessions() {
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = useToday(useTimeZone());

  return (
    <Page>
      <PageHeader title="Sessions" />
      <Tabs
        value={status ?? "all"}
        onValueChange={(value) =>
          void navigate({ search: { status: value === "all" ? undefined : (value as SessionsSearch["status"]) } })
        }
      >
        <TabsList>
          {FILTERS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {today && <History status={status} today={today} />}
    </Page>
  );
}

/**
 * The history, newest day first. `ListSessions` has no status filter, so
 * Completed and Stopped filter the loaded pages in the browser, like the
 * Unscheduled view on `/tasks`.
 */
function History({ status, today }: { status: SessionsSearch["status"]; today: LocalDate }) {
  const [pages, setPages] = useState(1);
  const result = useAtomValue(sessionListAtom({ pages, limit: PAGE_SIZE }));
  const { reload, remove } = useSessionActions();
  const isRemoved = useIsSessionRemoved();
  const [deleting, setDeleting] = useState<FocusSession | null>(null);

  // Keep showing the pages already loaded while the next one arrives.
  const last = useRef<{ days: { date: LocalDate; focusedMinutes: number; sessions: FocusSession[] }[]; nextCursor: string | null } | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  const data = last.current;
  const loadingMore = !AsyncResult.isSuccess(result) && data !== undefined;

  if (!data) {
    if (AsyncResult.isFailure(result)) return <LoadFailed onRetry={() => void reload()} />;
    return <ListSkeleton />;
  }

  const days = data.days
    .map((day) => ({
      ...day,
      sessions: day.sessions.filter((session) => !isRemoved(session.id) && (!status || session.status === status)),
    }))
    .filter((day) => day.sessions.length > 0);

  return (
    <div className="flex w-full flex-col gap-6 pb-8">
      {AsyncResult.isFailure(result) && <LoadFailed onRetry={() => void reload()} />}
      {days.length === 0 && !data.nextCursor ? (
        status ? (
          <PageEmpty
            icon={TimerIcon}
            title={status === "completed" ? "No completed sessions" : "No stopped sessions"}
            description={
              status === "completed"
                ? "Sessions that run their full time show up here."
                : "Sessions you end early show up here."
            }
            className="min-h-60"
          />
        ) : (
          <PageEmpty
            icon={TimerIcon}
            title="No sessions yet"
            description="Start a focus session from Now."
            className="min-h-60"
          >
            <Button asChild size="sm" className="rounded-full">
              <Link to="/now" search={{ date: undefined }}>
                Go to Now
              </Link>
            </Button>
          </PageEmpty>
        )
      ) : (
        days.map((day) => (
          <section key={day.date} aria-label={formatDayLong(day.date)} className="flex flex-col gap-2">
            <DayHeading date={day.date} today={today} focusedMinutes={day.focusedMinutes} />
            <div className="rounded-xl border bg-card p-1.5 shadow-(--card-shadow)">
              <SessionList sessions={day.sessions} label={formatDayLong(day.date)} onDelete={setDeleting} />
            </div>
          </section>
        ))
      )}
      {(data.nextCursor || loadingMore) && (
        <Button
          variant="outline"
          className="self-center rounded-full"
          disabled={loadingMore}
          onClick={() => setPages((count) => count + 1)}
        >
          {loadingMore && <Spinner />}
          Load more
        </Button>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `“${sessionName(deleting)}” (${formatFocused(deleting)} of ${formatMinutes(deleting.plannedMinutes)}) will be removed, including its place in your diary and Live. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                const exit = await remove(deleting.id);
                if (Exit.isFailure(exit)) toast.error(failureMessage(exit, "Couldn't delete the session."));
              }}
            >
              Delete session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Today  Tue, Nov 3 ........ 1 h 15 min focused". The total counts every session that day. */
function DayHeading({ date, today, focusedMinutes }: { date: LocalDate; today: LocalDate; focusedMinutes: number }) {
  const relative = relativeDay(date, today);
  const named = relative === "Today" || relative === "Yesterday";
  return (
    <h2 className="flex items-baseline gap-2 px-1">
      <span className="font-semibold">{named ? relative : formatDay(date, today)}</span>
      {named && <span className="text-sm text-muted-foreground">{formatDay(date, today)}</span>}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        <span className="font-medium text-focus-ink">{formatMinutes(focusedMinutes)}</span> focused
      </span>
    </h2>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      Couldn't load your sessions.
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {[3, 2].map((rows) => (
        <div key={rows} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-col gap-3 rounded-xl border p-3">
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
