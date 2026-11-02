import { TAG_COLOR, TAG_NAME_MAX_LENGTH, type Tag, type TagColor } from "@dueboard/api/rpc";
import * as Exit from "effect/Exit";
import { CheckIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TagChip } from "@/components/tag-chip";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { failureMessage, useTaskActions } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";

// Creating and editing a tag, in its own card over the task card.

/** `tag` set: edit it. `null`: create one. */
export type TagDialogTarget = { readonly tag: Tag | null };

/**
 * The tag card. `onSaved` gets the created or updated tag (the task card
 * picks a newly created one); `onDeleted` the id of a deleted one.
 */
export function TagDialog({
  target,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  target: TagDialogTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (tag: Tag) => void;
  onDeleted?: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm!">
        {target && (
          <TagForm
            key={target.tag?.id ?? "new"}
            tag={target.tag}
            onDone={(tag) => {
              onSaved?.(tag);
              onOpenChange(false);
            }}
            onDeleted={(id) => {
              onDeleted?.(id);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TagForm({
  tag,
  onDone,
  onDeleted,
}: {
  tag: Tag | null;
  onDone: (tag: Tag) => void;
  onDeleted: (id: string) => void;
}) {
  const actions = useTaskActions();
  const system = tag?.systemKind != null;
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState<TagColor>(tag?.color ?? "teal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setError(null), [name, color]);

  const trimmed = name.trim();
  const unchanged = tag !== null && trimmed === tag.name && color === tag.color;

  const submit = async () => {
    if (!trimmed || saving) return;
    if (unchanged) return onDone(tag);
    setSaving(true);
    const exit: Exit.Exit<Tag, unknown> = tag
      ? await actions.updateTag({
          id: tag.id,
          color,
          // System tags can't be renamed; sending the name would be refused.
          ...(system || trimmed === tag.name ? {} : { name: trimmed }),
        })
      : await actions.createTag({ name: trimmed, color });
    setSaving(false);
    if (Exit.isSuccess(exit)) onDone(exit.value);
    else setError(failureMessage(exit, tag ? "Couldn't save the tag." : "Couldn't create the tag."));
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        // This card renders in a portal, but React still bubbles its submit
        // through the component tree, into the task card's form around it.
        event.stopPropagation();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{tag ? "Edit tag" : "New tag"}</DialogTitle>
        <DialogDescription>
          {system
            ? "Built-in tags keep their name, but you can change their color."
            : "Tags group your tasks. Pick a name and a color."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tag-name">Name</Label>
        <Input
          id="tag-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={TAG_NAME_MAX_LENGTH}
          disabled={system}
          autoFocus={!system}
          placeholder="Work, Errands, Reading…"
          aria-invalid={error ? true : undefined}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Color</legend>
        <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
          {TAG_COLOR.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              aria-label={key}
              data-tag={key}
              onClick={() => setColor(key)}
              className={cn(
                "grid size-7 place-items-center rounded-full bg-tag text-background outline-none ring-offset-2 ring-offset-popover transition-transform focus-visible:ring-2 focus-visible:ring-ring",
                color === key && "scale-110 ring-2 ring-foreground/70",
              )}
            >
              {color === key && <CheckIcon aria-hidden="true" className="size-3.5" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          Preview <TagChip name={trimmed || "Tag"} color={color} />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="items-center sm:justify-between!">
        {tag && !system ? <DeleteTag tag={tag} onDeleted={onDeleted} /> : <span />}
        <Button type="submit" disabled={!trimmed || saving}>
          {tag ? "Save tag" : "Create tag"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteTag({ tag, onDeleted }: { tag: Tag; onDeleted: (id: string) => void }) {
  const { deleteTag } = useTaskActions();
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          <Trash2Icon />
          Delete tag
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the “{tag.name}” tag?</AlertDialogTitle>
          <AlertDialogDescription>Its tasks move to the default tag. This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={async (event) => {
              event.preventDefault();
              setBusy(true);
              const exit = await deleteTag(tag.id);
              setBusy(false);
              if (Exit.isSuccess(exit)) {
                toast("Tag deleted");
                onDeleted(tag.id);
              } else {
                toast.error(failureMessage(exit, "Couldn't delete the tag."));
              }
            }}
          >
            Delete tag
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
