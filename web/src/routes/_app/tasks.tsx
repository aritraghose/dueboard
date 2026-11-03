import type { ListTasksInput, Task } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  CalendarClockIcon,
  CalendarOffIcon,
  CheckCheckIcon,
  ListChecksIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import { LayoutGroup } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CreateButton, Page, PageEmpty, PageHeader } from "@/components/page";
import { TaskDialog } from "@/components/task-card";
import { TagChip } from "@/components/tag-chip";
import { TagFilter } from "@/components/tag-filter";
import { TaskList } from "@/components/task-list";
import { ViewControls } from "@/components/view-controls";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useTaskDialog } from "@/hooks/use-task-dialog";
import { type ViewOptions, useViewOptions } from "@/hooks/use-view-options";
import { taskListAtom, unscheduledAtom, useOptimisticStatus, useTagMap, useTags, useTaskActions, useWithoutRemoved } from "@/hooks/use-tasks";
import { type LocalDate, localDateOf } from "@/lib/dates";
import { type TaskGroup, dayHeading, groupByDay, groupByTag, sortTasks, upcomingDay } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const VIEWS = ["all", "upcoming", "unscheduled", "settled"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = {
  all: "All",
  upcoming: "Upcoming",
  unscheduled: "Unscheduled",
  settled: "Settled",
};

type TasksSearch = {
  /** Absent means `all`. */
  view?: Exclude<View, "all"> | undefined;
  /** Tag ids; a task shows when it has any of them. */
  tags?: readonly string[] | undefined;
  q?: string | undefined;
};

const PAGE_SIZE = 30;

/** `?tags=` from the URL: up to 50 tag ids (anything else is dropped). */
const readTagIds = (raw: unknown): readonly string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64).slice(0, 50);
  return ids.length ? ids : undefined;
};

export const Route = createFileRoute("/_app/tasks")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    view:
      typeof search.view === "string" && VIEWS.includes(search.view as View) && search.view !== "all"
        ? (search.view as Exclude<View, "all">)
        : undefined,
    tags: readTagIds(search.tags),
    q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  }),
  head: () => ({ meta: [{ title: "Tasks · Dueboard" }] }),
  component: Tasks,
});

function Tasks() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = useToday(useTimeZone());
  const view: View = search.view ?? "all";
  const tags = useTags();
  const tagIds = search.tags ?? [];

  const dialog = useTaskDialog();
  // How the list is sorted and grouped (the tabs above pick which tasks).
  const [display, setDisplay] = useViewOptions("tasks");
  // A new task goes on today, or stays undated from the Unscheduled view.
  const newTask = () => {
    if (today) dialog.openNew(view === "unscheduled" ? null : today);
  };
  useKeyShortcut("n", newTask);

  const setSearch = (patch: Partial<TasksSearch>) =>
    void navigate({ search: (current) => ({ ...current, ...patch }), replace: true });

  return (
    <Page>
      <PageHeader title="Tasks" description="Everything you need to do, dated or not.">
        <CreateButton label="New task" disabled={!today} onClick={newTask} />
      </PageHeader>

      <div className="flex w-full flex-col gap-4 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(next) => setSearch({ view: next === "all" ? undefined : (next as Exclude<View, "all">) })}>
            <TabsList>
              {VIEWS.map((value) => (
                <TabsTrigger key={value} value={value} className="px-2.5 max-sm:px-1.5 max-sm:text-[0.8125rem]">
                  {VIEW_LABEL[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <TagFilter tags={tags} value={tagIds} onChange={(next) => setSearch({ tags: next.length ? next : undefined })} />
          <SearchField value={search.q ?? ""} onChange={(q) => setSearch({ q: q.trim() ? q : undefined })} />
          <ViewControls
            view={display}
            onChange={setDisplay}
            className="sm:ml-auto"
            groups={[
              { value: "auto", label: "Day" },
              { value: "tag", label: "Tag" },
              { value: "none", label: "None" },
            ]}
          />
        </div>

        {today && (
          <Results
            key={`${view}|${tagIds.join(",")}|${search.q ?? ""}`}
            view={view}
            tagIds={tagIds}
            query={search.q}
            today={today}
            onClearFilters={() => setSearch({ tags: undefined, q: undefined })}
            onOpenTask={dialog.openTask}
            display={display}
          />
        )}
        {today && (
          <TaskDialog
            target={dialog.target}
            open={dialog.open}
            version={dialog.version}
            onOpenChange={dialog.setOpen}
            today={today}
          />
        )}
      </div>
    </Page>
  );
}

/** Title search, sent to the URL a moment after typing stops. */
function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => latest.current(text), 250);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <InputGroup className="h-8 min-w-40 flex-1 basis-48 rounded-lg">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            setText("");
          }
        }}
        maxLength={200}
        placeholder="Search titles"
        aria-label="Search task titles"
      />
      {text && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setText("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

type ResultsProps = {
  view: View;
  tagIds: readonly string[];
  query: string | undefined;
  today: LocalDate;
  onClearFilters: () => void;
  onOpenTask: (task: Task) => void;
  display: ViewOptions;
};

function Results(props: ResultsProps) {
  return props.view === "unscheduled" ? <UnscheduledResults {...props} /> : <PagedResults {...props} />;
}

/** Unscheduled tasks come whole from `ListUnscheduledTasks`; tag and search filter them here. */
function UnscheduledResults({ tagIds, query, today, onClearFilters, onOpenTask, display }: ResultsProps) {
  const result = useAtomValue(unscheduledAtom);
  const { reload } = useTaskActions();
  const tasks = useMemo(() => {
    if (!AsyncResult.isSuccess(result)) return undefined;
    const needle = query?.toLowerCase();
    return result.value.open.filter(
      (task) => (tagIds.length === 0 || tagIds.includes(task.tagId)) && (!needle || task.title.toLowerCase().includes(needle)),
    );
  }, [result, tagIds, query]);

  return (
    <ResultList
      view="unscheduled"
      tasks={tasks}
      failed={AsyncResult.isFailure(result)}
      onRetry={() => void reload()}
      filtered={Boolean(tagIds.length || query)}
      today={today}
      onClearFilters={onClearFilters}
      onOpenTask={onOpenTask}
      display={display}
    />
  );
}

/** `ListTasks`, a page at a time ("Load more"). */
function PagedResults({ view, tagIds, query, today, onClearFilters, onOpenTask, display }: ResultsProps) {
  const [pages, setPages] = useState(1);
  const filters = useMemo((): Omit<ListTasksInput, "cursor"> => {
    const base: Omit<ListTasksInput, "cursor"> = {
      limit: PAGE_SIZE,
      ...(tagIds.length ? { tagIds } : {}),
      ...(query ? { query } : {}),
    };
    if (view === "upcoming") return { ...base, from: today, status: ["idle", "working"] };
    if (view === "settled") return { ...base, status: ["settled"] };
    return base;
  }, [view, tagIds, query, today]);

  const atom = taskListAtom({ filters, pages });
  const result = useAtomValue(atom);
  const { reload } = useTaskActions();

  // Keep showing the pages already loaded while the next one arrives.
  const last = useRef<{ tasks: Task[]; nextCursor: string | null } | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  const data = last.current;
  const loadingMore = !AsyncResult.isSuccess(result) && data !== undefined;

  return (
    <ResultList
      view={view}
      tasks={data?.tasks}
      failed={AsyncResult.isFailure(result)}
      onRetry={() => void reload()}
      filtered={Boolean(tagIds.length || query)}
      today={today}
      onClearFilters={onClearFilters}
      onOpenTask={onOpenTask}
      display={display}
      footer={
        data?.nextCursor || loadingMore ? (
          <Button
            variant="outline"
            className="self-center"
            disabled={loadingMore}
            onClick={() => setPages((count) => count + 1)}
          >
            {loadingMore && <Spinner />}
            Load more
          </Button>
        ) : null
      }
    />
  );
}

function ResultList({
  view,
  tasks: loadedTasks,
  failed,
  onRetry,
  filtered,
  today,
  onClearFilters,
  onOpenTask,
  display,
  footer,
}: {
  view: View;
  tasks: readonly Task[] | undefined;
  failed: boolean;
  onRetry: () => void;
  filtered: boolean;
  today: LocalDate;
  onClearFilters: () => void;
  onOpenTask: (task: Task) => void;
  display: ViewOptions;
  footer?: ReactNode;
}) {
  const tags = useTagMap();
  const timeZone = useTimeZone();
  const loaded = useWithoutRemoved(loadedTasks ?? []);
  const tasks = loadedTasks ? loaded : undefined;
  const { statusOf, change } = useOptimisticStatus(tasks ?? []);

  const tagList = useTags();

  // Sorted first; grouping keeps that order inside each group. "Day" groups
  // only where the view has days to group by (Upcoming, Settled).
  const sections = useMemo((): Section[] | null => {
    if (!tasks) return null;
    const sorted = sortTasks(tasks, display.sort, display.direction);
    if (display.group === "tag") {
      return groupByTag(sorted, tagList ?? []).map(({ tag, tasks: list }) => ({
        key: tag?.id ?? "other",
        heading: tag ? <TagChip name={tag.name} color={tag.color} /> : "Other",
        label: tag?.name ?? "Other",
        tasks: list,
      }));
    }
    let days: TaskGroup[] | null = null;
    if (display.group === "auto" && view === "upcoming")
      days = groupByDay(sorted, (task) => upcomingDay(task, today), "asc");
    if (display.group === "auto" && view === "settled")
      days = groupByDay(sorted, (task) => (task.settledAt ? localDateOf(task.settledAt, timeZone) : null), "desc");
    if (days) {
      return days.map((group) => ({
        key: group.date,
        heading: dayHeading(group.date, today),
        label: dayHeading(group.date, today),
        tasks: group.tasks,
        today: group.date === today,
        byDay: true,
      }));
    }
    return [{ key: "all", heading: null, label: `${VIEW_LABEL[view]} tasks`, tasks: sorted }];
  }, [tasks, display, tagList, view, today, timeZone]);

  if (failed && !tasks) {
    return (
      <PageEmpty icon={ListChecksIcon} title="Couldn't load your tasks" description="Check your connection, then try again.">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </PageEmpty>
    );
  }
  if (!tasks) {
    return (
      <div className="flex flex-col gap-4 px-2 py-2" aria-hidden="true">
        {[64, 40, 72, 52].map((width) => (
          <div key={width} className="flex items-center gap-3">
            <Skeleton className="size-4.5 rounded-full" />
            <Skeleton className="h-4" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }
  if (tasks.length === 0) return <EmptyResults view={view} filtered={filtered} onClearFilters={onClearFilters} />;

  const rowProps = { tags, today, statusOf, onStatusChange: change, onOpen: onOpenTask };

  return (
    <LayoutGroup>
      <div className="flex flex-col gap-6">
        {(sections ?? []).map((section) => (
          <section key={section.key} aria-label={section.label} className="flex flex-col gap-1">
            {section.heading && (
              <h2
                className={cn(
                  "px-2 text-xs font-medium",
                  section.today || !section.byDay ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {section.heading}
              </h2>
            )}
            <TaskList
              tasks={section.tasks}
              label={section.label}
              showAssigned={!section.byDay && view !== "unscheduled"}
              {...rowProps}
            />
          </section>
        ))}
        {footer}
      </div>
    </LayoutGroup>
  );
}

/** A run of rows under one heading (a day or a tag), or the whole list with none. */
type Section = {
  readonly key: string;
  readonly heading: ReactNode;
  readonly label: string;
  readonly tasks: readonly Task[];
  readonly today?: boolean;
  readonly byDay?: boolean;
};

function EmptyResults({
  view,
  filtered,
  onClearFilters,
}: {
  view: View;
  filtered: boolean;
  onClearFilters: () => void;
}) {
  if (filtered) {
    return (
      <PageEmpty icon={SearchXIcon} title="No tasks match" description="Try another word or tag, or clear the filters.">
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      </PageEmpty>
    );
  }
  switch (view) {
    case "upcoming":
      return (
        <PageEmpty
          icon={CalendarClockIcon}
          title="Nothing coming up"
          description="Open tasks dated today or later show here, by day. Add one with New task."
        />
      );
    case "unscheduled":
      return (
        <PageEmpty
          icon={CalendarOffIcon}
          title="No unscheduled tasks"
          description="Tasks without a date wait here. New task on this tab starts without a date."
        />
      );
    case "settled":
      return (
        <PageEmpty
          icon={CheckCheckIcon}
          title="Nothing settled yet"
          description="Tick the circle beside a task to settle it. Settled tasks show here by the day you settled them."
        />
      );
    default:
      return (
        <PageEmpty
          icon={ListChecksIcon}
          title="No tasks yet"
          description="Add one with New task, or press N. It goes on today unless you clear its date."
        />
      );
  }
}
