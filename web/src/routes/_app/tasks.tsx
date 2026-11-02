import { createFileRoute } from "@tanstack/react-router";
import { ListChecksIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({ meta: [{ title: "Tasks · Dueboard" }] }),
  component: Tasks,
});

function Tasks() {
  return (
    <Page>
      <PageHeader title="Tasks" description="Everything you need to do, dated or not." />
      <PageEmpty
        icon={ListChecksIcon}
        title="No tasks yet"
        description="Tasks you add show up here, sorted by when they're due, with their tags, deadlines and importance."
      />
    </Page>
  );
}
