import {
  GOAL_COUNT_MAX,
  GOAL_DESCRIPTION_MAX_LENGTH,
  GOAL_NAME_MAX_LENGTH,
  type Goal,
  type GoalProgressMode,
  PRIVACY,
  type Privacy,
  goalValue,
} from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Trash2Icon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { GoalLinksPanel } from "@/components/goal-links";
import { GoalSlider } from "@/components/goal-progress";
import { DateField, Segmented } from "@/components/task-fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBootstrap } from "@/hooks/use-bootstrap";
import type { GoalDialogTarget } from "@/hooks/use-goal-dialog";
import { goalAtom, useGoalActions, useGoalColor } from "@/hooks/use-goals";
import { failureMessage } from "@/hooks/use-tasks";
import type { LocalDate } from "@/lib/dates";
import type { LinkDraft } from "@/lib/goals";
import { PRIVACY_HINT, PRIVACY_LABEL } from "@/lib/privacy";

// The goal card: one form for creating and editing a goal, saved as a whole
// with "Add goal" or "Save", like the habit card. Its links panel (count
// goals only) is part of the form: links are added, changed and removed
// when the form saves.

const MODE_LABEL: Record<GoalProgressMode, string> = { count: "Count", slider: "Slider" };

type Values = {
  name: string;
  description: string;
  mode: GoalProgressMode;
  /** Text, so a half-typed number can sit in the field. */
  target: string;
  /** A count (as text) or a percent (as text). */
  progress: string;
  /** Whether the user set the progress here, so Save sends it. */
  progressTouched: boolean;
  targetDate: LocalDate | null;
  privacy: Privacy;
  shareToLive: boolean;
};

export function GoalDialog({
  target,
  open,
  version,
  onOpenChange,
  today,
}: {
  target: GoalDialogTarget | null;
  open: boolean;
  /** Changes on every open, so the form starts from the target each time. */
  version: number;
  onOpenChange: (open: boolean) => void;
  today: LocalDate;
}) {
  const color = useGoalColor();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tag={color} className="max-h-[calc(100dvh-2rem)] gap-0! overflow-y-auto p-0! sm:max-w-lg!">
        {target?.mode === "edit" && (
          <EditGoal key={version} goal={target.goal} today={today} onClose={() => onOpenChange(false)} />
        )}
        {target?.mode === "create" && <GoalForm key={version} goal={null} savedLinks={[]} today={today} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Loads the goal's links, then shows the form. */
function EditGoal({ goal, today, onClose }: { goal: Goal; today: LocalDate; onClose: () => void }) {
  const result = useAtomValue(goalAtom(goal.id));
  // The links the form starts from: read once, so a refetch doesn't undo the user's edits.
  const [links, setLinks] = useState<readonly LinkDraft[] | null>(null);
  const summary = AsyncResult.isSuccess(result) ? result.value : undefined;
  useEffect(() => {
    if (summary && links === null) {
      setLinks(
        summary.links.map((link) => ({
          itemType: link.itemType,
          itemId: link.itemId,
          title: link.itemTitle,
          amount: link.amount,
        })),
      );
    }
  }, [summary, links]);
  // The freshest copy of the goal (its progress may have moved since the list loaded).
  const fresh = summary && summary.goal.updatedAt >= goal.updatedAt ? summary.goal : goal;
  return (
    <GoalForm
      goal={fresh}
      savedLinks={links}
      failed={AsyncResult.isFailure(result) && links === null}
      today={today}
      onClose={onClose}
    />
  );
}

const valueText = (goal: Goal): string => String(goalValue(goal));

function GoalForm({
  goal,
  savedLinks,
  failed = false,
  today,
  onClose,
}: {
  goal: Goal | null;
  /** `null` while an existing goal's links load. */
  savedLinks: readonly LinkDraft[] | null;
  failed?: boolean;
  today: LocalDate;
  onClose: () => void;
}) {
  const actions = useGoalActions();
  const settings = useBootstrap()?.settings;
  const [values, setValues] = useState<Values>(() =>
    goal
      ? {
          name: goal.name,
          description: goal.description ?? "",
          mode: goal.progressMode,
          target: goal.targetCount?.toString() ?? "",
          progress: valueText(goal),
          progressTouched: false,
          targetDate: goal.targetDate,
          privacy: goal.privacy,
          shareToLive: goal.shareToLive,
        }
      : {
          name: "",
          description: "",
          mode: "count",
          target: "",
          progress: "0",
          progressTouched: false,
          targetDate: null,
          privacy: settings?.defaultPrivacy ?? "connections",
          shareToLive: settings?.defaultShareToLive ?? true,
        },
  );
  const [links, setLinks] = useState<readonly LinkDraft[] | null>(savedLinks);
  useEffect(() => {
    if (links === null && savedLinks !== null) setLinks(savedLinks);
  }, [links, savedLinks]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const change = (patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };

  // Progress follows the open goal until the user sets it here.
  useEffect(() => {
    if (goal && !values.progressTouched && values.mode === goal.progressMode) {
      setValues((current) => ({ ...current, progress: valueText(goal) }));
    }
  }, [goal, values.progressTouched, values.mode]);

  const name = values.name.trim();
  const targetCount = Number(values.target);
  const targetValid = values.mode === "slider" || (Number.isInteger(targetCount) && targetCount >= 1 && targetCount <= GOAL_COUNT_MAX);
  const progress = Number(values.progress);
  const progressValid =
    values.mode === "slider"
      ? progress >= 0 && progress <= 100
      : Number.isInteger(progress) && progress >= 0 && progress <= GOAL_COUNT_MAX;
  const hasLinks = (links?.length ?? 0) > 0;
  const canSave = name.length > 0 && targetValid && progressValid && links !== null && !saving;

  const switchMode = (mode: GoalProgressMode) => {
    if (mode === values.mode) return;
    // Show the progress carried over, as the API will carry it.
    const percent =
      values.mode === "slider" ? progress : targetValid && targetCount > 0 ? Math.min(100, Math.floor((progress * 100) / targetCount)) : 0;
    const carried = mode === "slider" ? percent : targetValid ? Math.floor((percent * targetCount) / 100) : 0;
    change({ mode, progress: String(Number.isFinite(carried) ? carried : 0) });
  };

  const submit = async () => {
    if (!canSave || !links) return;
    setSaving(true);
    const description = values.description.trim() ? values.description : null;
    const failure = goal ? await saveEdit(goal, description) : await saveNew(description);
    setSaving(false);
    if (failure === null) {
      onClose();
      toast(goal ? "Goal saved" : "Goal added");
    } else {
      setError(failure);
    }
  };

  const saveLinks = async (goalId: string, before: readonly LinkDraft[]): Promise<string | null> => {
    for (const link of links ?? []) {
      const saved = before.find((other) => other.itemType === link.itemType && other.itemId === link.itemId);
      if (saved?.amount === link.amount) continue;
      const exit = await actions.link({ goalId, itemType: link.itemType, itemId: link.itemId, amount: link.amount });
      if (Exit.isFailure(exit)) return failureMessage(exit, `Couldn't link "${link.title}".`);
    }
    return null;
  };

  const saveNew = async (description: string | null): Promise<string | null> => {
    const created = await actions.create({
      name,
      description,
      progressMode: values.mode,
      ...(values.mode === "count" ? { targetCount } : {}),
      value: progress,
      targetDate: values.targetDate,
      privacy: values.privacy,
      shareToLive: values.shareToLive,
    });
    if (Exit.isFailure(created)) return failureMessage(created, "Couldn't add the goal.");
    if (values.mode !== "count") return null;
    const linked = await saveLinks(created.value.id, []);
    // The goal exists either way; say what didn't link and close.
    if (linked !== null) {
      toast.error(linked);
      return null;
    }
    return null;
  };

  const saveEdit = async (saved: Goal, description: string | null): Promise<string | null> => {
    const before = savedLinks ?? [];
    // Unlink first: a goal with links can't switch to a slider.
    for (const link of before) {
      if (links?.some((other) => other.itemType === link.itemType && other.itemId === link.itemId)) continue;
      const exit = await actions.unlink({ goalId: saved.id, itemType: link.itemType, itemId: link.itemId });
      if (Exit.isFailure(exit)) return failureMessage(exit, `Couldn't unlink "${link.title}".`);
    }
    const modeChanged = values.mode !== saved.progressMode;
    const targetChanged = values.mode === "count" && targetCount !== saved.targetCount;
    const patch = {
      ...(name !== saved.name ? { name } : {}),
      ...(description !== saved.description ? { description } : {}),
      ...(values.targetDate !== saved.targetDate ? { targetDate: values.targetDate } : {}),
      ...(values.privacy !== saved.privacy ? { privacy: values.privacy } : {}),
      ...(values.shareToLive !== saved.shareToLive ? { shareToLive: values.shareToLive } : {}),
      ...(modeChanged ? { progressMode: values.mode } : {}),
      ...(targetChanged ? { targetCount } : {}),
    };
    let current = saved;
    if (Object.keys(patch).length > 0) {
      const exit = await actions.update({ id: saved.id, ...patch });
      if (Exit.isFailure(exit)) return failureMessage(exit, "Couldn't save the goal.");
      current = exit.value;
    }
    if (values.progressTouched && progress !== goalValue(current)) {
      const exit = await actions.setProgress(saved.id, progress);
      if (Exit.isFailure(exit)) return failureMessage(exit, "Couldn't save the progress.");
    }
    return values.mode === "count" ? saveLinks(saved.id, before) : null;
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <header className="flex flex-col gap-2 border-b p-4 pr-12">
        <DialogTitle className="text-sm font-medium text-muted-foreground">{goal ? "Edit goal" : "New goal"}</DialogTitle>
        <DialogDescription className="sr-only">
          Name the goal and choose how its progress is measured; everything else is optional.
        </DialogDescription>
        <Textarea
          value={values.name}
          onChange={(event) => change({ name: event.target.value.replace(/\n/g, "") })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          maxLength={GOAL_NAME_MAX_LENGTH}
          rows={1}
          autoFocus={!goal}
          placeholder="Where do you want to get to?"
          aria-label="Name"
          className="field-sizing-content min-h-0! resize-none border-transparent! bg-transparent! px-2! py-1! text-lg! font-semibold tracking-tight shadow-none! placeholder:font-normal hover:border-input! focus-visible:border-ring! dark:bg-transparent!"
        />
      </header>

      <dl className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3 gap-y-4 p-4 text-sm max-sm:grid-cols-1 max-sm:gap-y-1.5">
        <Row label="Measured by">
          <Segmented
            label="Measured by"
            value={values.mode}
            options={(["count", "slider"] as const).map((value) => ({ value, label: MODE_LABEL[value] }))}
            onChange={(mode) => (mode === "slider" && hasLinks ? setError("Remove its links to switch to a slider.") : switchMode(mode))}
          />
          <p className="text-xs text-muted-foreground">
            {values.mode === "count"
              ? hasLinks
                ? "Counts toward a target. Remove its links to switch to a slider."
                : "Counts toward a target, by hand or from linked habits and tasks."
              : "A percent you set by hand."}
          </p>
        </Row>

        {values.mode === "count" ? (
          <Row label="Progress">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={GOAL_COUNT_MAX}
                value={values.progress}
                aria-label="Done so far"
                aria-invalid={!progressValid || undefined}
                onChange={(event) => change({ progress: event.target.value, progressTouched: true })}
                className="w-24!"
              />
              <span className="text-muted-foreground">of</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={GOAL_COUNT_MAX}
                value={values.target}
                placeholder="250"
                aria-label="Target"
                aria-invalid={(values.target !== "" && !targetValid) || undefined}
                onChange={(event) => change({ target: event.target.value })}
                className="w-24!"
              />
            </div>
            {values.target !== "" && !targetValid && (
              <p role="alert" className="text-xs text-destructive">
                The target is a whole number from 1 to {GOAL_COUNT_MAX.toLocaleString("en-US")}.
              </p>
            )}
          </Row>
        ) : (
          <Row label="Progress">
            <div className="flex items-center gap-3 pt-1">
              <GoalSlider
                value={progress}
                label="Progress"
                onChange={(value) => change({ progress: String(value), progressTouched: true })}
                className="flex-1"
              />
              <span className="w-10 text-right font-medium text-tag-ink tabular-nums">{Math.round(progress)}%</span>
            </div>
          </Row>
        )}

        <Row label="Target date">
          <DateField
            label="Target date"
            value={values.targetDate}
            today={today}
            onChange={(targetDate) => change({ targetDate })}
          />
        </Row>

        <Row label="Description">
          <Textarea
            value={values.description}
            onChange={(event) => change({ description: event.target.value })}
            maxLength={GOAL_DESCRIPTION_MAX_LENGTH}
            placeholder="Not set"
            aria-label="Description"
            className="field-sizing-content min-h-16! resize-none placeholder:italic"
          />
        </Row>

        <Row label="Linked">
          {values.mode === "slider" ? (
            <p className="pt-1.5 text-xs text-muted-foreground">
              Only count goals move from habits and tasks. Switch to Count to link them.
            </p>
          ) : failed ? (
            <p className="pt-1.5 text-xs text-destructive">Couldn't load this goal's links. Close it and try again.</p>
          ) : links === null ? (
            <p className="pt-1.5 text-xs text-muted-foreground">Loading links…</p>
          ) : (
            <GoalLinksPanel links={links} onChange={(next) => (setLinks(next), setError(null))} />
          )}
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
            Show progress and completion on Live
          </label>
        </Row>
      </dl>

      <DialogFooter className="mx-0! mb-0! flex-row! flex-wrap items-center justify-end!">
        {goal && <DeleteGoal goal={goal} onDeleted={onClose} />}
        {error && (
          <p role="alert" className="mr-auto basis-full text-sm text-destructive sm:basis-auto">
            {error}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {saving ? (goal ? "Saving…" : "Adding…") : goal ? "Save" : "Add goal"}
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

/** Delete, after a confirmation; shared by the goal card and `/goals`. */
export function DeleteGoalDialog({
  goal,
  onOpenChange,
  onDeleted,
}: {
  goal: Goal;
  onOpenChange?: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const actions = useGoalActions();
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
        <AlertDialogDescription>
          “{goal.name}” will be removed with its progress history and links, including its place in your diary and
          Live. The habits and tasks linked to it stay. This can't be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={busy}
          onClick={async (event) => {
            event.preventDefault();
            setBusy(true);
            const exit = await actions.remove(goal.id);
            setBusy(false);
            if (Exit.isSuccess(exit)) {
              onOpenChange?.(false);
              onDeleted?.();
              toast("Goal deleted");
            } else {
              toast.error(failureMessage(exit, "Couldn't delete the goal."));
            }
          }}
        >
          Delete goal
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function DeleteGoal({ goal, onDeleted }: { goal: Goal; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" className="mr-auto">
          <Trash2Icon />
          Delete
        </Button>
      </AlertDialogTrigger>
      <DeleteGoalDialog goal={goal} onOpenChange={setOpen} onDeleted={onDeleted} />
    </AlertDialog>
  );
}
