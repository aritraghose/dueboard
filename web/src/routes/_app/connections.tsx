import { useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { SearchIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { PeopleList, PeopleLoadFailed, PeopleSection, statusOf } from "@/components/people-lists";
import { Button } from "@/components/ui/button";
import { socialOverviewAtom, useSocialActions } from "@/hooks/use-social";

/** The user's connections, newest first, each with Remove and Block. Opened from their profile. */
export const Route = createFileRoute("/_app/connections")({
  head: () => ({ meta: [{ title: "Connections · Dueboard" }] }),
  component: Connections,
});

function Connections() {
  const result = useAtomValue(socialOverviewAtom);
  const { reload } = useSocialActions();
  const data = AsyncResult.isSuccess(result) ? result.value : undefined;
  const failed = AsyncResult.isFailure(result) && !data;

  return (
    <Page>
      <PageHeader compact title="Connections">
        <Button asChild variant="outline">
          <Link to="/discover">
            <SearchIcon />
            Find people
          </Link>
        </Button>
      </PageHeader>
      <div className="flex w-full flex-col gap-6 pb-8">
        <PeopleSection title="Your connections" count={data?.connections.length}>
          {failed ? (
            <PeopleLoadFailed what="your connections" onRetry={() => void reload()} />
          ) : (
            <PeopleList
              people={data?.connections.map((connection) => ({
                key: connection.person.username,
                person: connection.person,
                status: statusOf("connected"),
              }))}
              empty="No connections yet."
            />
          )}
        </PeopleSection>
      </div>
    </Page>
  );
}
