import {
  PRIVACY,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_EXPECTED_MINUTES_MAX,
  TASK_STATUS,
  TASK_TITLE_MAX_LENGTH,
  type Privacy,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
} from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Trash2Icon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { DateField, Segmented, StarRating, TagSelect } from "@/components/task-fields";
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
import { useBootstrap, useTimeZone } from "@/hooks/use-bootstrap";
import type { TaskDialogTarget } from "@/hooks/use-task-dialog";
import { failureMessage, taskAtom, useTags, useTaskActions } from "@/hooks/use-tasks";
import { type LocalDate, formatDay, localDateOf } from "@/lib/dates";
import { formatMinutes } from "@/lib/tasks";

// The task card: a dialog with every field of one task, the unset ones as
// "Not set". Editing saves each change as it's made; creating collects the
// fields and adds the task with "Add task" (or Enter in the title).

const STATUS_LABEL: Record<TaskStatus, string> = { idle: "Idle", working: "Working", settled: "Settled" };
const PRIVACY_LABEL: Record<Privacy, string> = {
  public: "Public",
  connections: "Connections",
  private: "Private",
};
const PRIVACY_HINT: Record<Privacy, string> = {
  public: "Anyone can see it in your diary.",
  connections: "Your connections can see it in your diary.",
  private: "Only you can see it. Live shows that you did something, not what.",
};

type Field = Exclude<keyof UpdateTaskInput, "id"> | "status";
type Values = Pick<Task, Field>;
type Errors = Partial<Record<Field | "form", string>>;

export function TaskDialog({
  target,
  open,
  version,
  onOpenChange,
  today,
}: {
  target: TaskDialogTarget | null;
  open: boolean;
  /** Changes on every open, so a new task always starts blank. */
  version: number;
  onOpenChange: (open: boolean) => void;
  today: LocalDate;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0! overflow-y-auto p-0! sm:max-w-lg!">
        {target?.mode === "edit" && (
          <EditTask key={target.task.id} initial={target.task} today={today} onClose={close} />
        )}
        {target?.mode === "create" && (
          <CreateTask key={version} date={target.date} today={today} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateTask({ date, today, onClose }: { date: LocalDate | null; today: LocalDate; onClose: () => void }) {
  const { create } = useTaskActions();
  const settings = useBootstrap()?.settings;
  const defaultTag = useTags()?.find((tag) => tag.systemKind === "default");
  const [values, setValues] = useState<Values>({
    title: "",
    description: null,
    assignedDate: date,
    deadlineDate: null,
    tagId: "",
    status: "idle",
    privacy: settings?.defaultPrivacy ?? "connections",
    shareToLive: settings?.defaultShareToLive ?? true,
    importance: null,
    expectedMinutes: null,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const tagId = values.tagId || defaultTag?.id || "";

  const change = (_field: Field, patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const submit = async () => {
    const title = values.title.trim();
    if (!title || saving) return;
    setSaving(true);
    const exit = await create({
      title,
      description: values.description,
      assignedDate: values.assignedDate,
      deadlineDate: values.deadlineDate,
      ...(tagId ? { tagId } : {}),
      privacy: values.privacy,
      shareToLive: values.shareToLive,
      importance: values.importance,
      expectedMinutes: values.expectedMinutes,
    });
    setSaving(false);
    if (Exit.isSuccess(exit)) {
      onClose();
      toast("Task added");
    } else {
      setErrors({ form: failureMessage(exit, "Couldn't add the task.") });
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
        <DialogTitle className="text-sm font-medium text-muted-foreground">New task</DialogTitle>
        <DialogDescription className="sr-only">Give the task a title; every other field is optional.</DialogDescription>
        <Textarea
          value={values.title}
          onChange={(event) => change("title", { title: event.target.value.replace(/\n/g, "") })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          maxLength={TASK_TITLE_MAX_LENGTH}
          rows={1}
          autoFocus
          placeholder="What needs doing?"
          aria-label="Title"
          className={titleClass}
        />
      </header>

      <TaskFields mode="create" values={{ ...values, tagId }} errors={errors} today={today} onChange={change} />

      <DialogFooter className="mx-0! mb-0! items-center">
        {errors.form && (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!values.title.trim() || saving}>
          Add task
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditTask({ initial, today, onClose }: { initial: Task; today: LocalDate; onClose: () => void }) {
  const actions = useTaskActions();
  const timeZone = useTimeZone();
  const fetched = useAtomValue(taskAtom(initial.id));
  // The newest copy wins: what the list passed in, the refetched task, or
  // what the last save returned (it arrives before the refetch does).
  const [saved, setSaved] = useState<Task>(initial);
  const server = AsyncResult.isSuccess(fetched) ? fetched.value : undefined;
  const base = server && server.updatedAt >= saved.updatedAt ? server : saved;

  // Changes show at once: each field's unsaved value sits in `draft` until
  // its save answers. Only the latest save of a field clears it.
  const [draft, setDraft] = useState<Partial<Values>>({});
  const latestSave = useRef(new Map<Field, number>());
  const task = { ...base, ...draft } as Task;
  const [errors, setErrors] = useState<Errors>({});

  const track = async (
    field: Field,
    patch: Partial<Values>,
    call: () => Promise<Exit.Exit<Task, unknown>>,
    fallback: string,
  ) => {
    const id = (latestSave.current.get(field) ?? 0) + 1;
    latestSave.current.set(field, id);
    setErrors((current) => ({ ...current, [field]: undefined }));
    setDraft((current) => ({ ...current, ...patch }));
    const exit = await call();
    if (Exit.isSuccess(exit)) setSaved(exit.value);
    else setErrors((current) => ({ ...current, [field]: failureMessage(exit, fallback) }));
    if (latestSave.current.get(field) === id) {
      setDraft((current) => {
        const next = { ...current };
        for (const key of Object.keys(patch) as Field[]) delete next[key];
        return next;
      });
    }
    return Exit.isSuccess(exit);
  };

  const change = (field: Field, patch: Partial<Values>) =>
    field === "status" && patch.status
      ? track("status", patch, () => actions.setStatus({ id: task.id, status: patch.status! }), "Couldn't change the status.")
      : track(field, patch, () => actions.update({ id: task.id, ...patch }), "Couldn't save this change.");

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-1 border-b p-4 pr-12">
        <DialogTitle className="sr-only">{task.title}</DialogTitle>
        <DialogDescription className="sr-only">Every detail of this task. Changes save as you make them.</DialogDescription>
        <TitleField value={task.title} onSave={(title) => change("title", { title })} error={errors.title} />
        <p className="px-2 text-xs text-muted-foreground">Added {formatDay(localDateOf(task.createdAt, timeZone), today)}</p>
      </header>

      <TaskFields mode="edit" values={task} errors={errors} today={today} onChange={change} />

      <DialogFooter className="mx-0! mb-0! flex-row! items-center justify-between!">
        <DeleteTask
          task={task}
          onDelete={async () => {
            const exit = await actions.remove(task.id);
            if (Exit.isSuccess(exit)) {
              onClose();
              toast("Task deleted");
            } else {
              toast.error(failureMessage(exit, "Couldn't delete the task."));
            }
          }}
        />
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Every field but the title, the unset ones as "Not set". */
function TaskFields({
  mode,
  values,
  errors,
  today,
  onChange,
}: {
  mode: "create" | "edit";
  values: Values;
  errors: Errors;
  today: LocalDate;
  onChange: (field: Field, patch: Partial<Values>) => unknown;
}) {
  return (
    <dl className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3 gap-y-4 p-4 text-sm max-sm:grid-cols-1 max-sm:gap-y-1.5">
      {mode === "edit" && (
        <Row label="Status" error={errors.status}>
          <Segmented
            label="Status"
            value={values.status}
            options={TASK_STATUS.map((value) => ({ value, label: STATUS_LABEL[value] }))}
            onChange={(status) => onChange("status", { status })}
          />
        </Row>
      )}

      <Row label="Description" error={errors.description}>
        <DescriptionField
          value={values.description}
          onSave={(description) => onChange("description", { description })}
        />
      </Row>

      <Row label="Assigned date" error={errors.assignedDate}>
        <DateField
          label="Assigned date"
          value={values.assignedDate}
          today={today}
          max={values.deadlineDate}
          onChange={(assignedDate) => onChange("assignedDate", { assignedDate })}
        />
        {values.assignedDate === null && values.deadlineDate === null && (
          <p className="text-xs text-muted-foreground">With no dates, it waits in Unscheduled.</p>
        )}
      </Row>

      <Row label="Deadline" error={errors.deadlineDate}>
        <DateField
          label="Deadline"
          value={values.deadlineDate}
          today={today}
          min={values.assignedDate}
          onChange={(deadlineDate) => onChange("deadlineDate", { deadlineDate })}
        />
      </Row>

      <Row label="Tag" error={errors.tagId}>
        <TagSelect value={values.tagId} onSelect={(tag) => onChange("tagId", { tagId: tag.id })} />
      </Row>

      <Row label="Importance" error={errors.importance}>
        <StarRating value={values.importance} onChange={(importance) => onChange("importance", { importance })} />
      </Row>

      <Row label="Expected time" error={errors.expectedMinutes}>
        <MinutesField
          value={values.expectedMinutes}
          onSave={(expectedMinutes) => onChange("expectedMinutes", { expectedMinutes })}
        />
      </Row>

      <Row label="Privacy" error={errors.privacy}>
        <div className="flex flex-col gap-1.5">
          <Segmented
            label="Privacy"
            value={values.privacy}
            options={PRIVACY.map((value) => ({ value, label: PRIVACY_LABEL[value] }))}
            onChange={(privacy) => onChange("privacy", { privacy })}
          />
          <p className="text-xs text-muted-foreground">{PRIVACY_HINT[values.privacy]}</p>
        </div>
      </Row>

      <Row label="Live" error={errors.shareToLive}>
        <label className="flex items-center gap-2 py-1">
          <Checkbox
            checked={values.shareToLive}
            onCheckedChange={(checked) => onChange("shareToLive", { shareToLive: checked === true })}
          />
          Show on Live when settled
        </label>
      </Row>
    </dl>
  );
}

const titleClass =
  "field-sizing-content min-h-0! resize-none border-transparent! bg-transparent! px-2! py-1! text-lg! font-semibold tracking-tight shadow-none! placeholder:font-normal hover:border-input! focus-visible:border-ring! dark:bg-transparent!";

function Row({ label, error, children }: { label: string; error: string | undefined; children: ReactNode }) {
  return (
    <>
      <dt className="pt-1.5 text-muted-foreground max-sm:pt-2 max-sm:text-xs">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1">
        {children}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </dd>
    </>
  );
}

/** The title, edited in place. Enter or leaving the field saves; Escape undoes. */
function TitleField({
  value,
  onSave,
  error,
}: {
  value: string;
  onSave: (title: string) => Promise<boolean>;
  error: string | undefined;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText(value);
      return;
    }
    if (trimmed !== value && !(await onSave(trimmed))) return;
    setText(trimmed);
  };

  return (
    <>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value.replace(/\n/g, ""))}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape" && text !== value) {
            event.preventDefault();
            event.stopPropagation();
            setText(value);
          }
        }}
        maxLength={TASK_TITLE_MAX_LENGTH}
        rows={1}
        aria-label="Title"
        aria-invalid={error ? true : undefined}
        className={titleClass}
      />
      {error && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

/** Saves when the field is left. */
function DescriptionField({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (description: string | null) => unknown;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <Textarea
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = text.trim() ? text : null;
        if (next !== value) onSave(next);
      }}
      maxLength={TASK_DESCRIPTION_MAX_LENGTH}
      placeholder="Not set"
      aria-label="Description"
      className="field-sizing-content min-h-16! resize-none placeholder:italic"
    />
  );
}

function MinutesField({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (minutes: number | null) => unknown;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  const [invalid, setInvalid] = useState(false);
  const hintId = useId();
  useEffect(() => setText(value?.toString() ?? ""), [value]);

  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      if (value !== null) onSave(null);
      return;
    }
    const minutes = Number(text);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > TASK_EXPECTED_MINUTES_MAX) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (minutes !== value) onSave(minutes);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={TASK_EXPECTED_MINUTES_MAX}
          step={5}
          value={text}
          placeholder="Not set"
          aria-label="Expected minutes"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={hintId}
          className="w-24! placeholder:italic"
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
        />
        <span id={hintId} className="text-muted-foreground">
          {value !== null && !invalid && value >= 60 ? `minutes · ${formatMinutes(value)}` : "minutes"}
        </span>
      </div>
      {invalid && (
        <p role="alert" className="text-xs text-destructive">
          Enter whole minutes, from 1 to {TASK_EXPECTED_MINUTES_MAX} (one day).
        </p>
      )}
    </div>
  );
}

function DeleteTask({ task, onDelete }: { task: Task; onDelete: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          <Trash2Icon />
          Delete task
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
          <AlertDialogDescription>
            “{task.title}” will be removed
            {task.status === "settled" ? ", along with its place in your diary and Live" : ""}. This can't be undone.
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
              await onDelete();
              setBusy(false);
            }}
          >
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
