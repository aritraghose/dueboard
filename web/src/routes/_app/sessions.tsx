import { createFileRoute } from "@tanstack/react-router";
import { TimerIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";

export const Route = createFileRoute("/_app/sessions")({
  head: () => ({ meta: [{ title: "Sessions · Dueboard" }] }),
  component: Sessions,
});

function Sessions() {
  return (
    <Page>
      <PageHeader title="Sessions" description="Your focus sessions, running and done." />
      <PageEmpty
        icon={TimerIcon}
        title="No sessions yet"
        description="Focus sessions you start show up here, with how long each one ran and whether you finished it."
      />
    </Page>
  );
}
