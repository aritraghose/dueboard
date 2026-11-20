import { Link, createFileRoute } from "@tanstack/react-router";
import { AppLogo } from "@/components/app-logo";
import { GitHubMark } from "@/components/github-mark";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { HeroWorkbench } from "@/components/landing/hero-workbench";
import { TiboMark } from "@/components/tibo-mark";
import { Button } from "@/components/ui/button";
import { GITHUB_URL, SITE_DESCRIPTION, canonical, seo } from "@/lib/seo";

export const Route = createFileRoute("/_public/")({
  head: () => ({
    meta: seo({ title: "Dueboard · Productivity. Productivity. Productivity.", description: SITE_DESCRIPTION, path: "/" }),
    links: [canonical("/")],
  }),
  component: Landing,
});

function Landing() {
  const { user } = Route.useRouteContext();
  const destination = !user ? "/auth" : user.username ? "/now" : "/onboarding";
  const ctaLabel = user ? "Open your board" : "Get started";

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-10 pb-14 sm:px-6 sm:pt-14 sm:pb-20 lg:gap-12"
        >
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="flex max-w-2xl flex-col gap-3">
              <h1 id="hero-heading" className="text-hero font-[650] text-balance">
                Your day has a sidekick now.
              </h1>
              <p className="text-lede max-w-[40ch] text-pretty text-muted-foreground">
                Tasks, habits, goals and focus sessions, planned with Tibo.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base shadow-(--card-shadow)">
                <Link to={destination}>{ctaLabel}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full bg-card/85 px-5 text-base">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <GitHubMark data-icon="inline-start" className="size-4.5" />
                  GitHub
                </a>
              </Button>
            </div>
          </div>

          <HeroWorkbench />
        </section>

        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <FeatureShowcase />

          <section aria-labelledby="closing-heading" className="py-16 text-center sm:py-24">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-5">
              <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1.5 shadow-md">
                <TiboMark idle={false} className="size-11" />
              </div>
              <h2 id="closing-heading" className="text-section font-[650] text-balance">
                Plan today with someone in your corner.
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <Button asChild size="lg" className="h-12 rounded-full px-7 text-base shadow-(--card-shadow)">
                  <Link to={destination}>{ctaLabel}</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-12 rounded-full px-5 text-base">
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                    <GitHubMark data-icon="inline-start" className="size-4.5" />
                    GitHub
                  </a>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <div className="flex items-center gap-2">
            <AppLogo className="size-5" />
            <span className="font-medium text-foreground">Dueboard</span>
          </div>

          <div className="flex items-center gap-5">
            <Link to={destination} className="transition-colors hover:text-foreground">
              {user ? "Open your board" : "Sign in"}
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <GitHubMark className="size-4" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
