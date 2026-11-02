import { createFileRoute } from "@tanstack/react-router";
import { RepeatIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";

export const Route = createFileRoute("/_app/habits")({
  head: () => ({ meta: [{ title: "Habits · Dueboard" }] }),
  component: Habits,
});

function Habits() {
  return (
    <Page>
      <PageHeader title="Habits" description="The things you do again and again, and your streaks." />
      <PageEmpty
        icon={RepeatIcon}
        title="No habits yet"
        description="Habits you start show up here with their schedule, this period's progress and your current streak."
      />
    </Page>
  );
}
