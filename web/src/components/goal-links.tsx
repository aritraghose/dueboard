import { GOAL_COUNT_MAX, GOAL_LINK_AMOUNT_MAX, GOAL_NAME_MAX_LENGTH, type GoalLinkItem } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { CheckSquareIcon, LinkIcon, PlusIcon, RepeatIcon, SearchIcon, TargetIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { goalListAtom, linkableTasksAtom, useGoalColor } from "@/hooks/use-goals";
import { habitListAtom } from "@/hooks/use-habits";
import type { ItemGoalDraft, LinkDraft } from "@/lib/goals";

// Linking habits and tasks to goals, from both sides: the goal card's links
// panel picks habits and tasks, and the habit and task cards pick goals
// (or create a count goal on the spot). Every link carries an amount: what
// one check-in, or settling the task, adds to the goal.

/** What one check-in or settle adds: a small whole-number field. Saves on blur or Enter. */
export function AmountInput({
  value,
  label,
  onChange,
}: {
  value: number;
  /** Read by screen readers: "Amount for 5 a day". */
  label: string;
  onChange: (amount: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const amount = Number(text);
    if (!Number.isInteger(amount) || amount < 1 || amount > GOAL_LINK_AMOUNT_MAX) {
      setText(String(value));
      return;
    }
    if (amount !== value) onChange(amount);
  };
  return (
    <span className="inline-flex items-center rounded-md border border-input bg-background/60 pl-1.5 text-xs text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 dark:bg-input/30">
      +
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={GOAL_LINK_AMOUNT_MAX}
        value={text}
        aria-label={label}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="h-6 w-9 bg-transparent px-0.5 text-xs text-foreground tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </span>
  );
}

/** One row of a links list: an icon, the title, its amount and a remove button. */
function LinkRow({
  icon,
  title,
  note,
  amount,
  amountLabel,
  onAmount,
  onRemove,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  amount: number;
  amountLabel: string;
  onAmount: (amount: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border bg-background/50 py-1 pr-1 pl-2 dark:bg-input/20">
      <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <AmountInput value={amount} label={amountLabel} onChange={onAmount} />
        <span className="max-sm:hidden">{note}</span>
      </span>
      <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`Remove ${title}`} onClick={onRemove}>
        <XIcon />
      </Button>
    </li>
  );
}

const ITEM_ICON: Record<GoalLinkItem, ReactNode> = { habit: <RepeatIcon />, task: <CheckSquareIcon /> };
const ITEM_NOTE: Record<GoalLinkItem, string> = { habit: "per check-in", task: "when settled" };

/** A goal's links panel: the linked habits and tasks, and a picker to add more. */
export function GoalLinksPanel({
  links,
  onChange,
}: {
  links: readonly LinkDraft[];
  onChange: (links: readonly LinkDraft[]) => void;
}) {
  const update = (target: LinkDraft, amount: number) =>
    onChange(links.map((link) => (link === target ? { ...link, amount } : link)));
  return (
    <div className="flex flex-col gap-2">
      {links.length > 0 ? (
        <ul aria-label="Linked habits and tasks" className="flex flex-col gap-1">
          {links.map((link) => (
            <LinkRow
              key={`${link.itemType}-${link.itemId}`}
              icon={ITEM_ICON[link.itemType]}
              title={link.title}
              note={ITEM_NOTE[link.itemType]}
              amount={link.amount}
              amountLabel={`Amount for ${link.title}`}
              onAmount={(amount) => update(link, amount)}
              onRemove={() => onChange(links.filter((other) => other !== link))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Link a habit or task, and each check-in or settle moves this goal on its own.
        </p>
      )}
      <ItemPicker
        linked={links}
        onPick={(itemType, itemId, title) => onChange([...links, { itemType, itemId, title, amount: 1 }])}
      />
    </div>
  );
}

/** Search the user's habits and open tasks, and pick one to link. */
function ItemPicker({
  linked,
  onPick,
}: {
  linked: readonly LinkDraft[];
  onPick: (itemType: GoalLinkItem, itemId: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8! self-start font-normal">
          <LinkIcon />
          Link a habit or task
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))]! gap-0! p-0!">
        {open && (
          <ItemSearch
            linked={linked}
            onPick={(itemType, itemId, title) => {
              onPick(itemType, itemId, title);
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Waits for typing to pause before searching tasks. */
function useDebounced(value: string, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function ItemSearch({
  linked,
  onPick,
}: {
  linked: readonly LinkDraft[];
  onPick: (itemType: GoalLinkItem, itemId: string, title: string) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 250);
  const habitsResult = useAtomValue(habitListAtom);
  const tasksResult = useAtomValue(linkableTasksAtom(search));
  const isLinked = (itemType: GoalLinkItem, id: string) =>
    linked.some((link) => link.itemType === itemType && link.itemId === id);
  const needle = query.trim().toLowerCase();

  const habits = AsyncResult.isSuccess(habitsResult)
    ? habitsResult.value
        .map(({ habit }) => habit)
        .filter((habit) => habit.status !== "archived" && !isLinked("habit", habit.id))
        .filter((habit) => !needle || habit.title.toLowerCase().includes(needle))
    : undefined;
  const tasks = AsyncResult.isSuccess(tasksResult)
    ? tasksResult.value.tasks.filter((task) => !isLinked("task", task.id))
    : undefined;

  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-2 border-b px-3">
        <SearchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search habits and tasks"
          aria-label="Search habits and tasks"
          autoFocus
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex max-h-72 flex-col overflow-y-auto p-1.5">
        <PickGroup
          title="Habits"
          items={habits?.map((habit) => ({ id: habit.id, title: habit.title }))}
          icon={ITEM_ICON.habit}
          empty={needle ? "No habits match." : "No habits to link."}
          onPick={(id, title) => onPick("habit", id, title)}
        />
        <PickGroup
          title="Open tasks"
          items={tasks?.map((task) => ({ id: task.id, title: task.title }))}
          icon={ITEM_ICON.task}
          empty={needle ? "No open tasks match." : "No open tasks to link."}
          onPick={(id, title) => onPick("task", id, title)}
        />
      </div>
    </div>
  );
}

function PickGroup({
  title,
  items,
  icon,
  empty,
  onPick,
}: {
  title: string;
  items: readonly { id: string; title: string }[] | undefined;
  icon: ReactNode;
  empty: string;
  onPick: (id: string, title: string) => void;
}) {
  return (
    <section aria-label={title} className="flex flex-col pb-1">
      <h4 className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{title}</h4>
      {items === undefined ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item.id, item.title)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
              >
                {icon}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "Moves goal" on a habit or task card: the goals it moves, each with its
 * amount, a picker of the user's count goals, and a way to create a count
 * goal on the spot.
 */
export function ItemGoalsField({
  itemType,
  value,
  onChange,
}: {
  itemType: GoalLinkItem;
  /** `undefined` while the saved links load. */
  value: readonly ItemGoalDraft[] | undefined;
  onChange: (goals: readonly ItemGoalDraft[]) => void;
}) {
  const color = useGoalColor();
  if (value === undefined) return <p className="py-1.5 text-xs text-muted-foreground">Loading goals…</p>;
  return (
    <div data-tag={color} className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul aria-label="Goals it moves" className="flex flex-col gap-1">
          {value.map((draft) => (
            <LinkRow
              key={draft.key}
              icon={<TargetIcon className="text-tag" />}
              title={draft.goalId ? draft.name : `${draft.name} (new, target ${draft.targetCount})`}
              note={ITEM_NOTE[itemType]}
              amount={draft.amount}
              amountLabel={`Amount for ${draft.name}`}
              onAmount={(amount) => onChange(value.map((other) => (other === draft ? { ...other, amount } : other)))}
              onRemove={() => onChange(value.filter((other) => other !== draft))}
            />
          ))}
        </ul>
      )}
      <GoalPicker
        taken={value}
        onPick={(draft) => onChange([...value, draft])}
        label={value.length > 0 ? "Move another goal" : "Link to a goal"}
      />
    </div>
  );
}

function GoalPicker({
  taken,
  onPick,
  label,
}: {
  taken: readonly ItemGoalDraft[];
  onPick: (draft: ItemGoalDraft) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8! self-start font-normal">
          <TargetIcon />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))]! gap-0! p-0!">
        {open && (
          <GoalSearch
            taken={taken}
            onPick={(draft) => {
              onPick(draft);
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

let draftKey = 0;

function GoalSearch({ taken, onPick }: { taken: readonly ItemGoalDraft[]; onPick: (draft: ItemGoalDraft) => void }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const result = useAtomValue(goalListAtom);
  const needle = query.trim().toLowerCase();
  const goals = AsyncResult.isSuccess(result)
    ? result.value
        .map(({ goal }) => goal)
        .filter((goal) => goal.status !== "completed" && !taken.some((draft) => draft.goalId === goal.id))
        .filter((goal) => !needle || goal.name.toLowerCase().includes(needle))
    : undefined;
  const counts = goals?.filter((goal) => goal.progressMode === "count");
  const sliders = goals?.filter((goal) => goal.progressMode === "slider") ?? [];

  if (creating) {
    return (
      <NewCountGoal
        initialName={query.trim()}
        onCancel={() => setCreating(false)}
        onCreate={(name, targetCount) =>
          onPick({ key: `new-${++draftKey}`, goalId: null, name, targetCount, amount: 1 })
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-2 border-b px-3">
        <SearchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your goals"
          aria-label="Search your goals"
          autoFocus
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex max-h-64 flex-col overflow-y-auto p-1.5">
        {counts === undefined ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
        ) : counts.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {needle ? "No count goals match." : "No count goals yet."}
          </p>
        ) : (
          <ul aria-label="Count goals" className="flex flex-col">
            {counts.map((goal) => (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({ key: goal.id, goalId: goal.id, name: goal.name, targetCount: goal.targetCount, amount: 1 })
                  }
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <TargetIcon aria-hidden="true" className="size-3.5 shrink-0 text-tag" />
                  <span className="min-w-0 flex-1 truncate">{goal.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {goal.currentCount} / {goal.targetCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {sliders.length > 0 && (
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            {sliders.length === 1 ? "1 slider goal is" : `${sliders.length} slider goals are`} hidden: only count goals
            can be linked.
          </p>
        )}
      </div>
      <div className="border-t p-1.5">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
        >
          <PlusIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          {needle ? `New count goal "${query.trim()}"` : "New count goal"}
        </button>
      </div>
    </div>
  );
}

/** A count goal made from a habit or task card: a name and a target. */
function NewCountGoal({
  initialName,
  onCancel,
  onCreate,
}: {
  initialName: string;
  onCancel: () => void;
  onCreate: (name: string, targetCount: number) => void;
}) {
  const [name, setName] = useState(initialName);
  const [target, setTarget] = useState("");
  const targetCount = Number(target);
  const valid =
    name.trim().length > 0 && Number.isInteger(targetCount) && targetCount >= 1 && targetCount <= GOAL_COUNT_MAX;
  const submit = () => valid && onCreate(name.trim(), targetCount);
  return (
    <div
      className="flex flex-col gap-3 p-3"
      onKeyDown={(event) => {
        // Inside a form (the habit card), Enter would submit it.
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      }}
    >
      <p className="text-sm font-medium">New count goal</p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={GOAL_NAME_MAX_LENGTH}
          placeholder="Solve 250 LeetCode problems"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Target
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={GOAL_COUNT_MAX}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="250"
          className="w-28!"
        />
      </label>
      <p className="text-xs text-muted-foreground">It starts at 0. Find it on Goals to change the rest.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Back
        </Button>
        <Button type="button" size="sm" disabled={!valid} onClick={submit}>
          Add goal
        </Button>
      </div>
    </div>
  );
}

