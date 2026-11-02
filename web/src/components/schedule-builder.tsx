import { HABIT_PERIOD_LENGTH_MAX, HABIT_TARGET_MAX, type HabitPeriodUnit } from "@dueboard/api/rpc";
import { MinusIcon, PlusIcon, RepeatIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Segmented } from "@/components/task-fields";
import { Button } from "@/components/ui/button";
import {
  PRESET_LABEL,
  SCHEDULE_PRESETS,
  type ScheduleDraft,
  type SchedulePreset,
  describeDraft,
  draftProblem,
  withPreset,
} from "@/lib/habits";
import { cn } from "@/lib/utils";

// The habit card's schedule: presets first, then the few inputs the picked
// preset needs, written as a sentence ("[3] times a week"), and a live
// preview of the sentence the habit will show, from the API's own
// `describeSchedule`.

const WEEKDAYS = [
  { day: 0, short: "S", name: "Sunday" },
  { day: 1, short: "M", name: "Monday" },
  { day: 2, short: "T", name: "Tuesday" },
  { day: 3, short: "W", name: "Wednesday" },
  { day: 4, short: "T", name: "Thursday" },
  { day: 5, short: "F", name: "Friday" },
  { day: 6, short: "S", name: "Saturday" },
] as const;

const UNIT_LABEL: Record<HabitPeriodUnit, string> = { day: "Days", week: "Weeks", month: "Months" };

export function ScheduleBuilder({
  draft,
  onChange,
}: {
  draft: ScheduleDraft;
  onChange: (draft: ScheduleDraft) => void;
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  const problem = draftProblem(draft);
  const count = (suffix: string) => (
    <Phrase>
      <Stepper label="Times" value={draft.count} max={HABIT_TARGET_MAX} onChange={(value) => set({ count: value })} />
      {suffix}
    </Phrase>
  );

  return (
    <div className="flex flex-col gap-3">
      <PresetPicker value={draft.preset} onChange={(preset) => onChange(withPreset(draft, preset))} />

      {draft.preset === "times_a_day" && count(draft.count === 1 ? "time a day" : "times a day")}
      {draft.preset === "times_a_week" && count(draft.count === 1 ? "time a week" : "times a week")}
      {draft.preset === "times_a_month" && count(draft.count === 1 ? "time a month" : "times a month")}
      {draft.preset === "every_n_days" && (
        <Phrase>
          Once every
          <Stepper
            label="Days"
            value={draft.length}
            min={2}
            max={HABIT_PERIOD_LENGTH_MAX}
            onChange={(value) => set({ length: value })}
          />
          days
        </Phrase>
      )}
      {draft.preset === "weekdays" && (
        <>
          <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => set({ weekdays })} />
          {count(draft.count === 1 ? "time on each of those days" : "times on each of those days")}
        </>
      )}
      {draft.preset === "month_days" && (
        <>
          <MonthDayPicker value={draft.monthDays} onChange={(monthDays) => set({ monthDays })} />
          {count(draft.count === 1 ? "time on each of those days" : "times on each of those days")}
        </>
      )}
      {draft.preset === "custom" && (
        <div className="flex flex-col gap-2">
          <Phrase>
            <Stepper label="Times" value={draft.count} max={HABIT_TARGET_MAX} onChange={(value) => set({ count: value })} />
            {draft.count === 1 ? "time every" : "times every"}
            <Stepper
              label="Period length"
              value={draft.length}
              max={HABIT_PERIOD_LENGTH_MAX}
              onChange={(value) => set({ length: value })}
            />
          </Phrase>
          <Segmented
            label="Period"
            value={draft.unit}
            options={(["day", "week", "month"] as const).map((value) => ({ value, label: UNIT_LABEL[value] }))}
            onChange={(unit) => set({ unit })}
          />
        </div>
      )}

      <p
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium",
          problem ? "bg-muted text-muted-foreground" : "bg-tag-soft text-tag-ink",
        )}
      >
        <RepeatIcon aria-hidden="true" className="size-4 shrink-0" />
        {problem ?? describeDraft(draft)}
      </p>
    </div>
  );
}

/** The presets as a wrapping row of choices; arrow keys move between them. */
function PresetPicker({ value, onChange }: { value: SchedulePreset; onChange: (preset: SchedulePreset) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Schedule"
      className="flex flex-wrap gap-1.5"
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const index = SCHEDULE_PRESETS.indexOf(value);
        const step = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (index + step + SCHEDULE_PRESETS.length) % SCHEDULE_PRESETS.length;
        const next = SCHEDULE_PRESETS[nextIndex];
        if (!next) return;
        onChange(next);
        event.currentTarget.querySelectorAll("button")[nextIndex]?.focus();
      }}
    >
      {SCHEDULE_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          role="radio"
          aria-checked={preset === value}
          tabIndex={preset === value ? 0 : -1}
          onClick={() => onChange(preset)}
          className={cn(
            "h-7 rounded-full border px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            preset === value && "border-transparent bg-tag-soft text-tag-ink hover:text-tag-ink",
          )}
        >
          {PRESET_LABEL[preset]}
        </button>
      ))}
    </div>
  );
}

/** Controls and words on one line, reading as a sentence. */
function Phrase({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>;
}

/** A whole number with − and + beside it; typing works too. */
function Stepper({
  label,
  value,
  min = 1,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  return (
    <div className="inline-flex h-8 items-center rounded-lg border bg-background/60 dark:bg-input/30">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-r-none"
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <MinusIcon />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(next)) onChange(clamp(next));
        }}
        className="h-full w-10 border-x bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] focus-visible:bg-accent [&::-webkit-inner-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-l-none"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

const toggleClass =
  "grid place-items-center rounded-md text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-tag aria-pressed:text-background";

const toggled = (days: readonly number[], day: number) =>
  days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);

function WeekdayPicker({ value, onChange }: { value: readonly number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Weekdays" className="flex gap-1">
        {WEEKDAYS.map(({ day, short, name }) => (
          <button
            key={day}
            type="button"
            aria-pressed={value.includes(day)}
            aria-label={name}
            title={name}
            onClick={() => onChange(toggled(value, day))}
            className={cn(toggleClass, "size-9 rounded-full bg-muted text-muted-foreground hover:text-foreground")}
          >
            {short}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <QuickPick onClick={() => onChange([1, 2, 3, 4, 5])}>Weekdays</QuickPick>
        <QuickPick onClick={() => onChange([0, 6])}>Weekends</QuickPick>
        <QuickPick onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])}>Every day</QuickPick>
      </div>
    </div>
  );
}

function QuickPick({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={onClick}>
      {children}
    </Button>
  );
}

function MonthDayPicker({ value, onChange }: { value: readonly number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Days of the month" className="grid w-fit grid-cols-7 gap-1">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={value.includes(day)}
            onClick={() => onChange(toggled(value, day))}
            className={cn(toggleClass, "size-8 bg-muted/70 text-muted-foreground hover:text-foreground")}
          >
            {day}
          </button>
        ))}
      </div>
      {value.some((day) => day > 28) && (
        <p className="text-xs text-muted-foreground">In shorter months, days past the end fall on the last day.</p>
      )}
    </div>
  );
}
