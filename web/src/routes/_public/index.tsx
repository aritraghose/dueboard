import { Link, createFileRoute } from "@tanstack/react-router";
import { TiboAside, TiboBubble } from "@/components/tibo-aside";
import { Button } from "@/components/ui/button";
import { GITHUB_URL, SITE_DESCRIPTION, canonical, seo } from "@/lib/seo";

export const Route = createFileRoute("/_public/")({
  head: () => ({
    meta: seo({ title: "Dueboard: everything that's due, on one board", description: SITE_DESCRIPTION, path: "/" }),
    links: [canonical("/")],
  }),
  component: Landing,
});

function Landing() {
  const { user } = Route.useRouteContext();
  const destination = !user ? "/auth" : user.username ? "/now" : "/onboarding";

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pt-6 pb-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
      <section className="flex w-full max-w-md flex-col gap-8 max-lg:mx-auto max-lg:pt-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-headline font-[650] text-balance">Everything that's due, on one board.</h1>
          <p className="text-lede text-pretty text-muted-foreground">
            Tasks, habits and goals, with Tibo, an AI friend who keeps you on track.
          </p>
        </div>
        <Button asChild size="lg" className="h-13 rounded-full text-base shadow-(--card-shadow)">
          <Link to={destination}>{user ? "Open your board" : "Get started"}</Link>
        </Button>
        <p className="border-t pt-6 text-sm text-pretty text-muted-foreground">
          Open source.{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            View the code on GitHub
          </a>
        </p>
      </section>

      <TiboAside label="Tibo says hi">
        <div className="flex flex-col gap-2.5">
          <TiboBubble delay={150}>Hi, I'm Tibo.</TiboBubble>
          <TiboBubble delay={900}>I keep your tasks, habits and goals on one board.</TiboBubble>
          <TiboBubble delay={1700}>Tell me what's going on and I'll handle the rest. Mostly.</TiboBubble>
        </div>
      </TiboAside>
    </main>
  );
}
