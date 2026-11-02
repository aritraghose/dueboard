import { createFileRoute } from "@tanstack/react-router";
import { TargetIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";

export const Route = createFileRoute("/_app/goals")({
  head: () => ({ meta: [{ title: "Goals · Dueboard" }] }),
  component: Goals,
});

function Goals() {
  return (
    <Page>
      <PageHeader title="Goals" description="Where you're headed, and how far you've come." />
      <PageEmpty
        icon={TargetIcon}
        title="No goals yet"
        description="Goals you set show up here with their progress. Link habits and tasks to a goal and it moves on its own."
      />
    </Page>
  );
}
