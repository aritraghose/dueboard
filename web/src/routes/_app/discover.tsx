import { useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { UsersIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { PeopleList, PeopleLoadFailed, PeopleSection, statusOf } from "@/components/people-lists";
import { PeopleSearch } from "@/components/people-search";
import { Button } from "@/components/ui/button";
import { socialOverviewAtom, useSocialActions } from "@/hooks/use-social";

/** Find people, answer connection requests and see the ones you sent. */
export const Route = createFileRoute("/_app/discover")({
  head: () => ({ meta: [{ title: "Discover · Dueboard" }] }),
  component: Discover,
});

function Discover() {
  const result = useAtomValue(socialOverviewAtom);
  const { reload } = useSocialActions();
  const data = AsyncResult.isSuccess(result) ? result.value : undefined;
  const failed = AsyncResult.isFailure(result) && !data;

  return (
    <Page>
      <PageHeader compact title="Discover">
        <Button asChild variant="outline">
          <Link to="/connections">
            <UsersIcon />
            Your connections
            {data && data.connections.length > 0 && (
              <span className="text-muted-foreground tabular-nums">{data.connections.length}</span>
            )}
          </Link>
        </Button>
      </PageHeader>
      <div className="flex w-full flex-col gap-6 pb-8">
        <PeopleSection
          title="Find people"
        >
          <div className="py-3">
            <PeopleSearch />
          </div>
        </PeopleSection>

        {(failed || !data || data.incoming.length > 0) && (
          <PeopleSection title="Requests" count={data?.incoming.length}>
            {failed ? (
              <PeopleLoadFailed what="your requests" onRetry={() => void reload()} />
            ) : (
              <PeopleList
                people={data?.incoming.map((request) => ({
                  key: request.id,
                  person: request.person,
                  status: statusOf("pending_in", request.id),
                }))}
                empty="No requests right now."
              />
            )}
          </PeopleSection>
        )}

        {data && data.outgoing.length > 0 && (
          <PeopleSection title="Sent" count={data.outgoing.length}>
            <PeopleList
              people={data.outgoing.map((request) => ({
                key: request.id,
                person: request.person,
                status: statusOf("pending_out", request.id),
              }))}
              empty=""
            />
          </PeopleSection>
        )}
      </div>
    </Page>
  );
}
