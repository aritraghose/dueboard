import { createFileRoute } from "@tanstack/react-router";
import { SlidersHorizontalIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";
import { TagChip } from "@/components/tag-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useTags } from "@/hooks/use-tasks";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · Dueboard" }] }),
  component: Settings,
});

function Settings() {
  const tags = useTags();
  const timeZone = useTimeZone();

  return (
    <Page>
      <PageHeader title="Settings" description="How Dueboard works for you." />

      <dl className="grid w-full max-w-3xl gap-x-8 gap-y-5 rounded-xl border bg-card p-5 shadow-(--card-shadow) sm:grid-cols-[10rem_1fr]">
        <dt className="text-sm text-muted-foreground">Time zone</dt>
        <dd className="-mt-4 font-medium sm:mt-0">
          {timeZone.replaceAll("_", " ")}
          <p className="text-sm font-normal text-muted-foreground">
            Follows your device, so your days start where you are.
          </p>
        </dd>
        <dt className="text-sm text-muted-foreground">Tags</dt>
        <dd className="-mt-4 flex flex-wrap gap-1.5 sm:mt-0">
          {tags ? (
            tags.map((tag) => <TagChip key={tag.id} name={tag.name} color={tag.color} />)
          ) : (
            <Skeleton className="h-5 w-48 rounded-full" />
          )}
        </dd>
      </dl>

      <PageEmpty
        icon={SlidersHorizontalIcon}
        title="More settings are on the way"
        description="Privacy defaults, who can relay messages to you, your Ask page and your connections will be set here."
        className="max-w-3xl rounded-xl border border-dashed"
      />
    </Page>
  );
}
