import { createFileRoute } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";

export const Route = createFileRoute("/_app/diary")({
  head: () => ({ meta: [{ title: "Diary · Dueboard" }] }),
  component: Diary,
});

function Diary() {
  return (
    <Page>
      <PageHeader title="Diary" description="Your days, as they happened." />
      <PageEmpty
        icon={BookOpenIcon}
        title="Your diary is empty"
        description="Settled tasks, checked habits, finished goals, notes and sessions collect here, one day at a time."
      />
    </Page>
  );
}
