import type { ContributionGraph as Graph, LocalDate, UserColor } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { contributionGraphAtom } from "@/hooks/use-diary";
import { addDays, daysBetween, formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

// A profile's contribution graph: one square per day for the last 53
// Sunday-starting weeks, shaded in the owner's user color by how much they
// got done (settled tasks, met habit goals, completed goals, finished
// sessions; private ones counted, never described). Squares are one tab
// stop: arrow keys move between days, Enter opens the day in the diary.

/** Count → shade, fixed so profiles compare: 0, 1–2, 3–4, 5–7, 8+. */
const levelOf = (count: number): number => (count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4);
const LEGEND = [0, 1, 2, 3, 4] as const;

const things = (count: number) => `${count.toLocaleString()} ${count === 1 ? "thing" : "things"}`;
const describe = (count: number, date: LocalDate, today: LocalDate) =>
  `${count === 0 ? "Nothing" : things(count)} on ${formatDay(date, today)}`;

const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const monthOf = (date: LocalDate) => monthFormat.format(new Date(`${date}T12:00:00Z`));

/** The weekday labels, on Monday, Wednesday and Friday rows. */
const WEEKDAYS = [
  { row: 1, label: "Mon" },
  { row: 3, label: "Wed" },
  { row: 5, label: "Fri" },
];

interface Cell {
  date: LocalDate;
  count: number;
  week: number;
  day: number;
}

function layout(graph: Graph) {
  const counts = new Map(graph.days.map((day) => [day.date, day.count]));
  const length = daysBetween(graph.from, graph.to) + 1;
  const cells: Cell[] = Array.from({ length }, (_, index) => {
    const date = addDays(graph.from, index);
    return { date, count: counts.get(date) ?? 0, week: Math.floor(index / 7), day: index % 7 };
  });
  const weeks = Math.ceil(length / 7);
  // A month is named over its first week; the first column only when the
  // next name is far enough away not to collide with it.
  const months: { week: number; label: string }[] = [];
  for (let week = 0; week < weeks; week++) {
    const sunday = cells[week * 7]!.date;
    if (week === 0 || Number(sunday.slice(8)) <= 7) months.push({ week, label: monthOf(sunday) });
  }
  if (months.length > 1 && months[1]!.week < 3) months.shift();
  return { cells, weeks, months };
}

export function ContributionGraph({
  username,
  color,
  selected,
  onSelectDay,
}: {
  username: string;
  color: UserColor | null;
  selected: LocalDate | null;
  onSelectDay: (date: LocalDate) => void;
}) {
  const result = useAtomValue(contributionGraphAtom(username));
  const graph = AsyncResult.isSuccess(result) ? result.value : undefined;

  return (
    <section
      data-tag={color ?? "teal"}
      aria-label="Activity graph"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-(--card-shadow) sm:p-5"
    >
      {graph ? (
        <GraphBody graph={graph} selected={selected} onSelectDay={onSelectDay} />
      ) : AsyncResult.isFailure(result) ? (
        <p className="py-10 text-center text-sm text-muted-foreground">The activity graph didn't load. Reload the page to try again.</p>
      ) : (
        <>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-28 w-full" />
        </>
      )}
    </section>
  );
}

function GraphBody({
  graph,
  selected,
  onSelectDay,
}: {
  graph: Graph;
  selected: LocalDate | null;
  onSelectDay: (date: LocalDate) => void;
}) {
  const { cells, weeks, months } = useMemo(() => layout(graph), [graph]);
  const todayIndex = Math.min(cells.length - 1, Math.max(0, daysBetween(graph.from, graph.today)));
  const selectedIndex = selected ? cells.findIndex((cell) => cell.date === selected) : -1;
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : todayIndex);
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // Narrow screens scroll the weeks; start at the newest.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, []);

  const showTip = (index: number) => {
    const button = buttons.current[index];
    const box = frame.current?.getBoundingClientRect();
    if (!button || !box) return;
    const cell = button.getBoundingClientRect();
    setTip({ index, x: cell.left + cell.width / 2 - box.left, y: cell.top - box.top });
  };

  const move = (index: number) => {
    const next = Math.min(todayIndex, Math.max(0, index));
    setActive(next);
    const button = buttons.current[next];
    button?.focus();
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step !== undefined) move(active + step);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(todayIndex);
    else return;
    event.preventDefault();
  };

  const tipCell = tip ? cells[tip.index] : undefined;
  const frameWidth = frame.current?.clientWidth ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-semibold">
          {graph.total === 0 ? "Nothing done in the last year yet" : `${things(graph.total)} done in the last year`}
        </h2>
        <Legend />
      </div>
      <div ref={frame} className="relative">
        <div
          ref={scroller}
          className="overflow-x-auto pb-1"
          onScroll={() => tip && showTip(tip.index)}
        >
          <div
            role="group"
            aria-label="Days of the last year. Use the arrow keys to move between days and Enter to open one in the diary."
            onKeyDown={onKeyDown}
            className="grid min-w-max gap-[3px] sm:min-w-0"
            style={{
              gridTemplateColumns: `auto repeat(${weeks}, minmax(0.6875rem, 1fr))`,
              gridTemplateRows: "auto",
            }}
          >
            {months.map(({ week, label }) => (
              <span
                key={week}
                aria-hidden="true"
                className="pb-0.5 text-xs whitespace-nowrap text-muted-foreground"
                style={{ gridColumn: `${week + 2} / span 3`, gridRow: 1 }}
              >
                {label}
              </span>
            ))}
            {WEEKDAYS.map(({ row, label }) => (
              <span
                key={label}
                aria-hidden="true"
                className="self-center pr-1.5 text-[0.6875rem] leading-none text-muted-foreground"
                style={{ gridColumn: 1, gridRow: row + 2 }}
              >
                {label}
              </span>
            ))}
            {cells.map((cell, index) => {
              const future = index > todayIndex;
              const position = { gridColumn: cell.week + 2, gridRow: cell.day + 2 };
              if (future) return <span key={cell.date} aria-hidden="true" style={position} />;
              return (
                <button
                  key={cell.date}
                  ref={(node) => {
                    buttons.current[index] = node;
                  }}
                  type="button"
                  tabIndex={index === active ? 0 : -1}
                  data-level={levelOf(cell.count)}
                  aria-label={describe(cell.count, cell.date, graph.today)}
                  aria-pressed={cell.date === selected}
                  aria-current={index === todayIndex ? "date" : undefined}
                  onClick={() => {
                    setActive(index);
                    onSelectDay(cell.date);
                  }}
                  onFocus={() => {
                    setActive(index);
                    showTip(index);
                  }}
                  onBlur={() => setTip(null)}
                  onPointerEnter={() => showTip(index)}
                  onPointerLeave={() => setTip((current) => (current?.index === index ? null : current))}
                  className={cn(
                    "contribution-cell aspect-square w-full rounded-[3px] outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                    cell.date === selected && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
                  )}
                  style={position}
                />
              );
            })}
          </div>
        </div>
        {tip && tipCell && (
          <div
            role="presentation"
            className="pointer-events-none absolute z-20 rounded-md bg-foreground px-2.5 py-1 text-xs whitespace-nowrap text-background"
            style={{
              left: Math.min(Math.max(tip.x, 80), Math.max(80, frameWidth - 80)),
              top: tip.y - 6,
              transform: "translate(-50%, -100%)",
            }}
          >
            {describe(tipCell.count, tipCell.date, graph.today)}
          </div>
        )}
      </div>
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
      Less
      {LEGEND.map((level) => (
        <span key={level} data-level={level} className="contribution-cell size-2.75 rounded-[3px]" />
      ))}
      More
    </div>
  );
}
