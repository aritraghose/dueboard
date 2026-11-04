import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SITE_DESCRIPTION, canonical, seo } from "@/lib/seo";

export const Route = createFileRoute("/_public/")({
  head: () => ({
    meta: seo({ title: "Dueboard: everything that's due, on one board", description: SITE_DESCRIPTION, path: "/" }),
    links: [canonical("/")],
  }),
  component: Landing,
});

const sample = [
  { title: "Rent", when: "Tomorrow" },
  { title: "Car insurance renewal", when: "Fri, Nov 6" },
  { title: "Library books", when: "Nov 12" },
  { title: "Passport photos", when: "Dec 3" },
];

function Landing() {
  const { user } = Route.useRouteContext();
  const destination = !user ? "/auth" : user.username ? "/now" : "/onboarding";

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-16 md:grid-cols-[1.2fr_1fr]">
      <section className="flex flex-col items-start gap-6">
        <h1 className="font-heading text-5xl leading-[1.05] font-semibold tracking-tighter text-balance md:text-6xl">
          Everything that's due, on one board.
        </h1>
        <p className="max-w-prose text-lg text-pretty text-muted-foreground">
          Bills, renewals, returns and deadlines in one place, sorted by when they're due, so
          nothing slips past.
        </p>
        <Button asChild size="lg">
          <Link to={destination}>{user ? "Open Dueboard" : "Get started"}</Link>
        </Button>
      </section>

      <ol aria-label="Example board" className="flex flex-col divide-y rounded-xl border bg-card">
        {sample.map((item) => (
          <li key={item.title} className="flex items-baseline justify-between gap-4 px-5 py-4">
            <span className="font-medium">{item.title}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{item.when}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
