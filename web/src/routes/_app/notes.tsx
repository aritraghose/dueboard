import { createFileRoute } from "@tanstack/react-router";
import { NotebookPenIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";

export const Route = createFileRoute("/_app/notes")({
  head: () => ({ meta: [{ title: "Notes · Dueboard" }] }),
  component: Notes,
});

function Notes() {
  return (
    <Page>
      <PageHeader title="Notes" description="Short notes on your days, 60 characters at a time." />
      <PageEmpty
        icon={NotebookPenIcon}
        title="No notes yet"
        description="Notes you write show up here, newest first, grouped by day."
      />
    </Page>
  );
}
