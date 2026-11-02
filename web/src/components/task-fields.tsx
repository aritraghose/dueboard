import type { Tag } from "@dueboard/api/rpc";
import { format } from "date-fns";
import { CalendarIcon, CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, StarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { TagDialog, type TagDialogTarget } from "@/components/tag-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTags } from "@/hooks/use-tasks";
import { IMPORTANCE_LABEL } from "@/lib/tasks";
import { type LocalDate, WEEK_STARTS_ON, formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

// Controls of the task card: the tag list, the date picker, stars and
// segmented choices.

/**
 * The task's tag, and a list to change it: each tag picks on click and has
 * an edit button, and "New tag" sits at the bottom. Editing and creating
 * open the tag card over the task card; a new tag is picked once created.
 */
export function TagSelect({ value, onSelect }: { value: string; onSelect: (tag: Tag) => void }) {
  const tags = useTags();
  const [open, setOpen] = useState(false);
  const [tagDialog, setTagDialog] = useState<{ target: TagDialogTarget | null; open: boolean }>({
    target: null,
    open: false,
  });
  const current = tags?.find((tag) => tag.id === value);

  const openTagDialog = (tag: Tag | null) => {
    setOpen(false);
    setTagDialog({ target: { tag }, open: true });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8! gap-2 self-start pr-2 font-normal"
            data-tag={current?.color}
            aria-label={`Tag: ${current?.name ?? "loading"}. Change tag`}
          >
            <span aria-hidden="true" className="size-2.5 rounded-full bg-tag" />
            {current?.name ?? "…"}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64! gap-0! p-1.5!">
          <ul aria-label="Tags" className="flex max-h-60 flex-col overflow-y-auto">
            {(tags ?? []).map((tag) => (
              <li key={tag.id} className="group/tag flex items-center gap-0.5 rounded-md hover:bg-accent has-focus-visible:bg-accent">
                <button
                  type="button"
                  data-tag={tag.color}
                  aria-pressed={tag.id === value}
                  onClick={() => {
                    onSelect(tag);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none"
                >
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-tag" />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {tag.id === value && <CheckIcon aria-hidden="true" className="size-4 text-primary" />}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mr-1 text-muted-foreground"
                  aria-label={`Edit ${tag.name}`}
                  onClick={() => openTagDialog(tag)}
                >
                  <PencilIcon />
                </Button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => openTagDialog(null)}
            className="mt-1 flex w-full items-center gap-2.5 rounded-md border-t px-2 pt-2.5 pb-1.5 text-left text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:bg-accent"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            New tag
          </button>
        </PopoverContent>
      </Popover>
      <TagDialog
        target={tagDialog.target}
        open={tagDialog.open}
        onOpenChange={(next) => setTagDialog((state) => ({ ...state, open: next }))}
        onSaved={(tag) => {
          // A new tag is picked; an edited one stays as it was.
          if (tagDialog.target?.tag === null) onSelect(tag);
        }}
      />
    </>
  );
}

const toDate = (date: LocalDate) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const toLocalDate = (date: Date) => format(date, "yyyy-MM-dd") as LocalDate;

/**
 * A date that may be unset: a button showing the day (or "Not set") that
 * opens a calendar. `min`/`max` grey out days on the wrong side of the other
 * date, so the assigned date stays on or before the deadline.
 */
export function DateField({
  label,
  value,
  today,
  min,
  max,
  onChange,
}: {
  label: string;
  value: LocalDate | null;
  today: LocalDate;
  min?: LocalDate | null | undefined;
  max?: LocalDate | null | undefined;
  onChange: (date: LocalDate | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const disabled = [
    ...(min ? [{ before: toDate(min) }] : []),
    ...(max ? [{ after: toDate(max) }] : []),
  ];
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8! min-w-36 justify-start font-normal", value === null && "text-muted-foreground italic")}
            aria-label={`${label}: ${value ? formatDay(value, today) : "not set"}. Change`}
          >
            <CalendarIcon className="text-muted-foreground" />
            {value ? formatDay(value, today) : "Not set"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto! p-0!">
          <Calendar
            mode="single"
            selected={value ? toDate(value) : undefined}
            defaultMonth={toDate(value ?? min ?? today)}
            weekStartsOn={WEEK_STARTS_ON}
            disabled={disabled}
            today={toDate(today)}
            onSelect={(date) => {
              if (date) onChange(toLocalDate(date));
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {value !== null && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

/**
 * 1–5 stars on a pill track, with the level in words beside them ("High").
 * Clicking the current value clears it; arrow keys move it while the group
 * has focus. A picked star pops, so the change reads at a glance.
 */
export function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const word = shown ? IMPORTANCE_LABEL[shown - 1] : null;
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="radiogroup"
        aria-label="Importance"
        className="flex items-center rounded-full bg-muted/70 p-0.5 ring-1 ring-border"
        onMouseLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const next = Math.min(5, Math.max(1, (value ?? 0) + (event.key === "ArrowRight" ? 1 : -1)));
          onChange(next);
          event.currentTarget.querySelectorAll("button")[next - 1]?.focus();
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} of 5, ${IMPORTANCE_LABEL[star - 1]?.toLowerCase()}`}
            tabIndex={(value ?? 1) === star ? 0 : -1}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(value === star ? null : star)}
            className="grid size-7 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StarIcon
              // Re-mounts when this star becomes the value, which replays the pop.
              key={value === star ? "picked" : "idle"}
              aria-hidden="true"
              className={cn(
                "size-4.5 transition-[color,fill,transform,filter] duration-200",
                star <= shown
                  ? "fill-importance text-importance drop-shadow-[0_1px_3px_color-mix(in_oklch,var(--importance)_60%,transparent)]"
                  : "fill-transparent text-muted-foreground/45",
                hover !== null && star <= hover && "scale-110",
                value === star && hover === null && "animate-star-pop",
              )}
            />
          </button>
        ))}
      </div>
      {word ? (
        <span className={cn("text-sm font-medium", hover === null ? "text-importance-ink" : "text-muted-foreground")}>
          {word}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground italic">Not set</span>
      )}
    </div>
  );
}

/** A small row of mutually exclusive options (status, privacy). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
}) {
  // Arrow keys move the choice and the focus together, like native radios.
  const move = (group: HTMLElement, step: number) => {
    const index = options.findIndex((option) => option.value === value);
    const nextIndex = (index + step + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    group.querySelectorAll("button")[nextIndex]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg bg-muted p-0.5"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          move(event.currentTarget, event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option.value === value && "bg-background text-foreground shadow-xs dark:bg-input",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
