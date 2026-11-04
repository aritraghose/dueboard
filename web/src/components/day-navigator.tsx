import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDayArrowKeys } from "@/hooks/use-day-arrow-keys";
import { useNow } from "@/hooks/use-now";
import {
  type LocalDate,
  addDays,
  daysBetween,
  formatClock,
  formatDay,
  formatDayLong,
  relativeDay,
} from "@/lib/dates";

export function NowClock({ today, timeZone }: { today: LocalDate | null; timeZone: string }) {
  const now = useNow(1000);
  if (!today || !now) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-center leading-tight">
      <p className="text-sm font-semibold">
        <time dateTime={today}>{formatDay(today)}</time>
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        <span className="sr-only">Local time </span>
        {formatClock(now, timeZone)}
      </p>
    </div>
  );
}

export function DayStepper({
  date,
  today,
  onChange,
}: {
  date: LocalDate | null;
  today: LocalDate | null;
  onChange: (date: LocalDate) => void;
}) {
  useDayArrowKeys(date, onChange);

  if (!date || !today) return <Skeleton className="h-9 w-40 rounded-lg" />;

  const near = Math.abs(daysBetween(today, date)) <= 1;
  const title = near ? relativeDay(date, today) : formatDay(date, today);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <div className="flex items-center gap-1">
        <StepButton label="Previous day" shortcut="←" onClick={() => onChange(addDays(date, -1))}>
          <ChevronLeftIcon />
        </StepButton>
        <h1 className="min-w-0 px-1 text-xl font-semibold tracking-tight" aria-live="polite">
          <time dateTime={date} title={formatDayLong(date)}>
            {title}
          </time>
        </h1>
        <StepButton label="Next day" shortcut="→" onClick={() => onChange(addDays(date, 1))}>
          <ChevronRightIcon />
        </StepButton>
      </div>
      {near && date !== today && (
        <p className="text-sm text-muted-foreground">{formatDay(date, today)}</p>
      )}
    </div>
  );
}

function StepButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut: "←" | "→";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label={label}
          aria-keyshortcuts={shortcut === "←" ? "ArrowLeft" : "ArrowRight"}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
