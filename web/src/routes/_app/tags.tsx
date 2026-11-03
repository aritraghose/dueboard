import type { Tag } from "@dueboard/api/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { CreateButton, Page, PageHeader } from "@/components/page";
import { TagChip } from "@/components/tag-chip";
import { TagDialog, type TagDialogTarget } from "@/components/tag-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useTags } from "@/hooks/use-tasks";

/** The user's tags: create, rename and recolor (built-in tags only recolor). */
export const Route = createFileRoute("/_app/tags")({
  head: () => ({ meta: [{ title: "Tags · Dueboard" }] }),
  component: Tags,
});

function Tags() {
  const tags = useTags();
  const [target, setTarget] = useState<TagDialogTarget | null>(null);
  const [open, setOpen] = useState(false);
  const edit = (tag: Tag | null) => {
    setTarget({ tag });
    setOpen(true);
  };
  useKeyShortcut("n", () => edit(null));
  const system = tags?.filter((tag) => tag.systemKind) ?? [];
  const own = tags?.filter((tag) => !tag.systemKind) ?? [];

  return (
    <Page>
      <PageHeader title="Tags" description="Group your tasks by tag. Changing one changes it everywhere.">
        <CreateButton label="New tag" onClick={() => edit(null)} />
      </PageHeader>
      <div className="flex w-full max-w-2xl flex-col gap-6 pb-8">
        <TagSection title="Your tags" description="Deleting one moves its tasks to default.">
          {!tags ? (
            <Skeleton className="h-24 w-full" />
          ) : own.length > 0 ? (
            <TagList tags={own} onEdit={edit} />
          ) : (
            <p className="py-3 text-sm text-muted-foreground">
              No tags of your own yet. Add one to sort tasks into work, home, or anything else.
            </p>
          )}
        </TagSection>
        <TagSection
          title="Built-in tags"
          description="Every task starts as default; habits and goals wear theirs. They keep their names, but you can recolor them."
        >
          {tags ? <TagList tags={system} onEdit={edit} /> : <Skeleton className="h-20 w-full" />}
        </TagSection>
      </div>
      <TagDialog target={target} open={open} onOpenChange={setOpen} />
    </Page>
  );
}

function TagSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl border bg-card px-4 py-1 shadow-(--card-shadow)">{children}</div>
    </section>
  );
}

function TagList({ tags, onEdit }: { tags: readonly Tag[]; onEdit: (tag: Tag) => void }) {
  return (
    <ul className="divide-y">
      {tags.map((tag) => (
        <li key={tag.id} className="flex items-center justify-between gap-3 py-2.5">
          <TagChip name={tag.name} color={tag.color} className="max-w-60" />
          <Button size="sm" variant="ghost" onClick={() => onEdit(tag)} aria-label={`Edit ${tag.name}`}>
            <PencilIcon />
            {tag.systemKind ? "Recolor" : "Edit"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
