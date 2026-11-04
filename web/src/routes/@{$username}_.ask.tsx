import type { Person } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Cause from "effect/Cause";
import { MessageCircleQuestionIcon, UserRoundXIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AskThread, HeaderPill, ProfileButton } from "@/components/ask-thread";
import { NotificationsButton } from "@/components/notifications-button";
import { PageEmpty } from "@/components/page";
import { PublicFrame } from "@/components/public-frame";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { askPageAtom } from "@/hooks/use-ask";
import { useMounted } from "@/hooks/use-mounted";
import { useSocialActions } from "@/hooks/use-social";
import { lastCheckedUser, rememberCheckedUser, type OnboardedUser } from "@/lib/session-cache";
import { readSidebarOpen } from "@/lib/sidebar-state";
import { canonical, seo } from "@/lib/seo";
import { getSessionUser } from "../session.ts";

/**
 * `/@username/ask` (architecture.md §7.6): anyone, signed in or not, asks the
 * owner's Ask agent, which appears as Tibo "answering for @username" and
 * knows only what the owner wrote in Settings → Ask page. Laid out like the
 * Inbox (`./_app/inbox.tsx`), with a button to the owner's profile. Off by
 * default ("not available"); the owner can always preview it.
 */
export const Route = createFileRoute("/@{$username}_/ask")({
  beforeLoad: async ({ cause }): Promise<{ user: OnboardedUser | null; sidebarOpen: boolean }> => {
    const checked = lastCheckedUser();
    if (cause === "stay" && checked) return { user: checked, sidebarOpen: readSidebarOpen() };
    // The session only picks the chrome; the proxy reads it again for the questions.
    const session = await getSessionUser().catch(() => null);
    const user = session?.username ? { ...session, username: session.username } : null;
    if (user) rememberCheckedUser(user);
    return { user, sidebarOpen: readSidebarOpen() };
  },
  head: ({ params }) => {
    const username = params.username.toLowerCase();
    const path = `/@${username}/ask`;
    return {
      meta: seo({
        title: `Ask @${username} · Dueboard`,
        description: `Ask @${username} a question. Tibo answers for them from what they chose to share.`,
        path,
        noindex: true,
      }),
      links: [canonical(path)],
    };
  },
  // Like the Inbox: the thread draws its own header (profile button and bell); Tibo's own button would confuse.
  staticData: { topBar: { tibo: false, notifications: false } },
  component: AskRoute,
});

function AskRoute() {
  const { user, sidebarOpen } = Route.useRouteContext();
  const { username } = Route.useParams();
  if (user) {
    return (
      <AppShell user={user} sidebarOpen={sidebarOpen}>
        <AskView
          username={username.toLowerCase()}
          signedIn
          // The whole screen, as on the Inbox.
          height="h-[calc(100dvh-6.375rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-0.75rem)]"
        />
      </AppShell>
    );
  }
  return (
    <PublicFrame>
      <AskView username={username.toLowerCase()} signedIn={false} height="h-[calc(100dvh-6rem)]" />
    </PublicFrame>
  );
}

function AskView({ username, signedIn, height }: { username: string; signedIn: boolean; height: string }) {
  const result = useAtomValue(askPageAtom(username));
  const { reload } = useSocialActions();
  // The server render can't reach `/rpc`; only a failure in the browser is real.
  const mounted = useMounted();

  if (AsyncResult.isFailure(result) && mounted) {
    const error = Cause.squash(result.cause) as { _tag?: string } | undefined;
    const missing = error?._tag === "UserNotFound" || error?._tag === "InvalidInput";
    return (
      <main className="flex flex-1 flex-col px-3">
        <PageEmpty
          icon={UserRoundXIcon}
          title={missing ? "This Ask page isn't available" : "Couldn't load this Ask page"}
          description={
            missing ? `There's no one called @${username}, or you can't see their page.` : "Check your connection, then try again."
          }
        >
          {missing ? (
            <Button asChild variant="outline">
              <Link to={signedIn ? "/now" : "/"}>{signedIn ? "Back to Now" : "Go to Dueboard"}</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void reload()}>
              Try again
            </Button>
          )}
        </PageEmpty>
      </main>
    );
  }

  const page = AsyncResult.isSuccess(result) ? result.value : undefined;
  if (page && !page.available) return <Unavailable person={page.person} />;

  return (
    <main className="flex flex-1 flex-col pt-1.5">
      <h1 className="sr-only">Ask @{username}</h1>
      {/* The thread lives in the visitor's own agent instance, so it renders in the browser only. */}
      <ClientOnly fallback={<div className={height} />}>
        {page ? (
          <AskThread
            page={page}
            signedIn={signedIn}
            className={`${height} min-h-96 text-foreground`}
            headerEnd={
              <>
                <HeaderPill className="border-primary/40 dark:border-bubble-tibo-border">
                  <ProfileButton person={page.person} />
                </HeaderPill>
                {signedIn && (
                  <HeaderPill>
                    <NotificationsButton />
                  </HeaderPill>
                )}
              </>
            }
          />
        ) : (
          <div className={`${height} flex items-center justify-center gap-2 text-sm text-muted-foreground`}>
            <Spinner />
            Loading…
          </div>
        )}
      </ClientOnly>
    </main>
  );
}

function Unavailable({ person }: { person: Person }) {
  const name = person.name.trim().split(/\s+/)[0] || `@${person.username}`;
  return (
    <main className="flex flex-1 flex-col px-3">
      <PageEmpty
        icon={MessageCircleQuestionIcon}
        title="This Ask page isn't available"
        description={`${name} hasn't turned it on, or you can't ask them here. You can still visit their profile.`}
      >
        <Button asChild variant="outline">
          <Link to="/@{$username}" params={{ username: person.username }}>
            View {name}'s profile
          </Link>
        </Button>
      </PageEmpty>
    </main>
  );
}
