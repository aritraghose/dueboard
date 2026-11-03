import { HABIT_DESCRIPTION_MAX_LENGTH, HABIT_TITLE_MAX_LENGTH, PRIVACY, type Habit, type Privacy } from "@dueboard/api/rpc";
import * as Exit from "effect/Exit";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ItemGoalsField } from "@/components/goal-links";
import { ScheduleBuilder } from "@/components/schedule-builder";
import { DateField, Segmented } from "@/components/task-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useItemGoalDrafts, useItemGoalSync } from "@/hooks/use-goals";
import type { HabitDialogTarget } from "@/hooks/use-habit-dialog";
import { useHabitActions, useHabitColor } from "@/hooks/use-habits";
import { failureMessage } from "@/hooks/use-tasks";
import type { LocalDate } from "@/lib/dates";
import { DEFAULT_DRAFT, type ScheduleDraft, draftFor, draftProblem, toSchedule } from "@/lib/habits";
import { PRIVACY_HINT, PRIVACY_LABEL } from "@/lib/privacy";

// The habit card: one form for creating and editing a habit, saved as a
// whole with "Initialize Habit" or "Save". Unlike the task card, a habit's fields
// hang together (the schedule especially), so nothing saves halfway. The
// goals it moves save with it, after the habit itself.

type Values = {
  title: string;
  description: string;
  schedule: ScheduleDraft;
  startDate: LocalDate;
  privacy: Privacy;
  shareToLive: boolean;
};

export function HabitDialog({
  target,
  open,
  version,
  onOpenChange,
  today,
}: {
  target: HabitDialogTarget | null;
  open: boolean;
  /** Changes on every open, so the form starts from the target each time. */
  version: number;
  onOpenChange: (open: boolean) => void;
  today: LocalDate;
}) {
  const color = useHabitColor();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tag={color} className="max-h-[calc(100dvh-2rem)] gap-0! overflow-y-auto p-0! sm:max-w-lg!">
        {target && (
          <HabitForm
            key={version}
            habit={target.mode === "edit" ? target.habit : null}
            today={today}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function HabitForm({ habit, today, onClose }: { habit: Habit | null; today: LocalDate; onClose: () => void }) {
  const actions = useHabitActions();
  const goals = useItemGoalDrafts("habit", habit?.id ?? null);
  const syncGoals = useItemGoalSync();
  const settings = useBootstrap()?.settings;
  const [values, setValues] = useState<Values>(() =>
    habit
      ? {
          title: habit.title,
          description: habit.description ?? "",
          schedule: draftFor(habit),
          startDate: habit.startDate,
          privacy: habit.privacy,
          shareToLive: habit.shareToLive,
        }
      : {
          title: "",
          description: "",
          schedule: DEFAULT_DRAFT,
          startDate: today,
          privacy: settings?.defaultPrivacy ?? "connections",
          shareToLive: settings?.defaultShareToLive ?? true,
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const change = (patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const title = values.title.trim();
  const canSave = title.length > 0 && draftProblem(values.schedule) === null && goals.drafts !== undefined && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const description = values.description.trim() ? values.description : null;
    const schedule = toSchedule(values.schedule);
    let exit;
    if (habit) {
      // Only what changed: a new schedule replaces the rule, so an untouched one isn't sent.
      const scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(toSchedule(draftFor(habit)));
      exit = await actions.update({
        id: habit.id,
        ...(title !== habit.title ? { title } : {}),
        ...(description !== habit.description ? { description } : {}),
        ...(scheduleChanged ? { schedule } : {}),
        ...(values.startDate !== habit.startDate ? { startDate: values.startDate } : {}),
        ...(values.privacy !== habit.privacy ? { privacy: values.privacy } : {}),
        ...(values.shareToLive !== habit.shareToLive ? { shareToLive: values.shareToLive } : {}),
      });
    } else {
      exit = await actions.create({
        title,
        description,
        schedule,
        startDate: values.startDate,
        privacy: values.privacy,
        shareToLive: values.shareToLive,
      });
    }
    if (Exit.isSuccess(exit) && goals.drafts && goals.saved) {
      // The habit is saved either way; a goal that didn't link says so.
      const failure = await syncGoals("habit", exit.value.id, goals.saved, goals.drafts);
      if (failure) toast.error(failure);
    }
    setSaving(false);
    if (Exit.isSuccess(exit)) {
      onClose();
      toast(habit ? "Habit saved" : "Habit initialized");
    } else {
      setError(failureMessage(exit, habit ? "Couldn't save the habit." : "Couldn't add the habit."));
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <header className="flex flex-col gap-2 border-b p-4 pr-12">
        <DialogTitle className="text-sm font-medium text-muted-foreground">{habit ? "Edit habit" : "New habit"}</DialogTitle>
        <DialogDescription className="sr-only">
          Name the habit and pick how often it's due; everything else is optional.
        </DialogDescription>
        <Textarea
          value={values.title}
          onChange={(event) => change({ title: event.target.value.replace(/\n/g, "") })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          maxLength={HABIT_TITLE_MAX_LENGTH}
          rows={1}
          autoFocus={!habit}
          placeholder="What do you want to keep doing?"
          aria-label="Title"
          className="field-sizing-content min-h-0! resize-none border-transparent! bg-transparent! px-2! py-1! text-lg! font-semibold tracking-tight shadow-none! placeholder:font-normal hover:border-input! focus-visible:border-ring! dark:bg-transparent!"
        />
      </header>

      <dl className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3 gap-y-4 p-4 text-sm max-sm:grid-cols-1 max-sm:gap-y-1.5">
        <Row label="Schedule">
          <ScheduleBuilder draft={values.schedule} onChange={(schedule) => change({ schedule })} />
        </Row>

        <Row label="Starts">
          <DateField
            label="Start date"
            value={values.startDate}
            today={today}
            required
            onChange={(startDate) => startDate && change({ startDate })}
          />
          {values.startDate > today && (
            <p className="text-xs text-muted-foreground">It shows up on your days from then on.</p>
          )}
        </Row>

        <Row label="Moves goal">
          <ItemGoalsField
            itemType="habit"
            value={goals.drafts}
            onChange={(drafts) => {
              goals.edit(drafts);
              setError(null);
            }}
          />
        </Row>

        <Row label="Description">
          <Textarea
            value={values.description}
            onChange={(event) => change({ description: event.target.value })}
            maxLength={HABIT_DESCRIPTION_MAX_LENGTH}
            placeholder="Not set"
            aria-label="Description"
            className="field-sizing-content min-h-16! resize-none placeholder:italic"
          />
        </Row>

        <Row label="Privacy">
          <div className="flex flex-col gap-1.5">
            <Segmented
              label="Privacy"
              value={values.privacy}
              options={PRIVACY.map((value) => ({ value, label: PRIVACY_LABEL[value] }))}
              onChange={(privacy) => change({ privacy })}
            />
            <p className="text-xs text-muted-foreground">{PRIVACY_HINT[values.privacy]}</p>
          </div>
        </Row>

        <Row label="Live">
          <label className="flex items-center gap-2 py-1">
            <Checkbox
              checked={values.shareToLive}
              onCheckedChange={(checked) => change({ shareToLive: checked === true })}
            />
            Show on Live when checked off
          </label>
        </Row>
      </dl>

      {/* One row on every width: Cancel at the left edge, the action at the right. */}
      <DialogFooter className="mx-0! mb-0! flex-row! flex-wrap items-center justify-between!">
        {error && (
          <p role="alert" className="basis-full text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {habit ? "Save" : "Initialize Habit"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-1.5 text-muted-foreground max-sm:pt-2 max-sm:text-xs">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1">{children}</dd>
    </>
  );
}
