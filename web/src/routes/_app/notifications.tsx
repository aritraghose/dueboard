import type { NotificationItem } from "@dueboard/api/rpc";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BellIcon, CheckIcon, SearchIcon, UserCheckIcon, UserPlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConnectionActions } from "@/components/connection-actions";
import { Page, PageEmpty, PageHeader } from "@/components/page";
import { PeopleLoadFailed, PeopleSection, statusOf } from "@/components/people-lists";
import { PersonAvatar } from "@/components/person-avatar";
import { UnreadDot } from "@/components/tibo-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkNotificationsSeen, useNotifications } from "@/hooks/use-notifications";
import { notificationAction, notificationTime } from "@/lib/notifications";

/**
 * Who asked to connect and who accepted your requests, newest first.
 * Requests still waiting can be answered here (or on Discover). Opening the
 * page marks everything seen; what was new stays under "New" until you leave.
 */
export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications · Dueboard" }] }),
  component: Notifications,
});

function Notifications() {
  const { items, failed, reload } = useNotifications();
  const markSeen = useMarkNotificationsSeen();

  // Unseen when first listed on this visit: they stay "New" after they're marked seen.
  const fresh = useRef(new Set<string>());
  for (const item of items ?? []) if (!item.seen) fresh.current.add(item.id);
  const anyUnseen = items?.some((item) => !item.seen) ?? false;
  useEffect(() => {
    if (anyUnseen) void markSeen();
  }, [anyUnseen, markSeen]);

  // Times are relative, so they're drawn in the browser only and kept current.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const newItems = items?.filter((item) => fresh.current.has(item.id)) ?? [];
  const earlier = items?.filter((item) => !fresh.current.has(item.id)) ?? [];

  return (
    <Page>
      <PageHeader title="Notifications">
        {/* Phones have the top row's bell instead, and the empty state's button. */}
        <Button asChild variant="outline" className="max-md:hidden">
          <Link to="/discover">
            <SearchIcon />
            Find people
          </Link>
        </Button>
      </PageHeader>
      <div className="flex w-full flex-col gap-6 pb-8">
        {failed ? (
          <div className={CARD}>
            <PeopleLoadFailed what="your notifications" onRetry={reload} />
          </div>
        ) : !items ? (
          <div className={CARD}>
            <NotificationsLoading />
          </div>
        ) : items.length === 0 ? (
          <PageEmpty
            icon={BellIcon}
            title="No notifications yet"
            description="When someone asks to connect, or accepts your request, you'll see it here."
          >
            <Button asChild variant="outline">
              <Link to="/discover">
                <SearchIcon />
                Find people
              </Link>
            </Button>
          </PageEmpty>
        ) : (
          <>
            {newItems.length > 0 && (
              <PeopleSection
                title={
                  <>
                    <UnreadDot className="size-2 self-center ring-0" />
                    New
                  </>
                }
                count={newItems.length}
              >
                <NotificationList items={newItems} now={now} />
              </PeopleSection>
            )}
            {earlier.length > 0 && (
              <PeopleSection title={newItems.length > 0 ? "Earlier" : "All caught up"}>
                <NotificationList items={earlier} now={now} />
              </PeopleSection>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

/** `PeopleSection`'s card, for the loading and failed states (which have no title). */
const CARD = "rounded-xl border bg-card px-4 py-1 shadow-(--card-shadow)";

function NotificationList({ items, now }: { items: readonly NotificationItem[]; now: Date | null }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <NotificationRow key={item.id} item={item} now={now} />
      ))}
    </ul>
  );
}

/**
 * The person, what they did and when, linking to their profile; then
 * Accept / Decline while their request waits, or how it was answered.
 * On phones the buttons drop under the words.
 */
function NotificationRow({ item, now }: { item: NotificationItem; now: Date | null }) {
  const { person } = item;
  const KindIcon = item.kind === "connection_request" ? UserPlusIcon : UserCheckIcon;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <Link
        to="/@{$username}"
        params={{ username: person.username }}
        className="flex min-w-[min(100%,15rem)] flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative shrink-0">
          <PersonAvatar person={person} />
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 flex size-[1.125rem] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card [&_svg]:size-2.5"
          >
            <KindIcon strokeWidth={2.5} />
          </span>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-pretty">
            <span className="font-medium">{person.name}</span> {notificationAction(item)}
          </span>
          <span className="flex min-w-0 gap-2 text-sm text-muted-foreground">
            <span className="truncate">@{person.username}</span>
            {now && (
              <time dateTime={item.createdAt.toISOString()} className="shrink-0">
                {notificationTime(item.createdAt, now)}
              </time>
            )}
          </span>
        </span>
      </Link>
      <NotificationOutcome item={item} />
    </li>
  );
}

function NotificationOutcome({ item }: { item: NotificationItem }) {
  if (item.kind !== "connection_request") return null;
  if (item.state === "pending") {
    return (
      <div className="shrink-0 max-sm:pl-12">
        <ConnectionActions username={item.person.username} status={statusOf("pending_in", item.requestId)} compact />
      </div>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground max-sm:pl-12">
      {item.state === "accepted" && <CheckIcon className="size-4 text-success-ink" />}
      {item.state === "accepted" ? "Accepted" : "Declined"}
    </span>
  );
}

function NotificationsLoading() {
  return (
    <div className="flex flex-col divide-y" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
