import { Link, createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/page";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BOARDS } from "@/lib/nav";

/** Every board as a card; each card opens its page. */
export const Route = createFileRoute("/_app/boards")({
  head: () => ({ meta: [{ title: "Boards · Dueboard" }] }),
  component: Boards,
});

function Boards() {
  return (
    <Page>
      <PageHeader title="Boards" description="Everything you keep track of, one board each." />
      {/*
        Square cards, close together, sized to the window. Rows always split
        the six boards evenly (no card left alone on a row): two across a
        phone, three from `sm`, all six from `xl`. The caps keep each card
        at most 13rem wide.
      */}
      <ul className="mx-auto grid w-full grid-cols-2 gap-2.5 sm:max-w-[40.5rem] sm:grid-cols-3 sm:gap-3 xl:max-w-[80.25rem] xl:grid-cols-6">
        {BOARDS.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="group block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="aspect-square justify-center rounded-2xl transition-colors group-hover:ring-foreground/25 [--card-spacing:--spacing(3)] sm:[--card-spacing:--spacing(4)]">
                <CardHeader className="justify-items-center gap-2 text-center">
                  <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground [&_svg]:size-5.5">
                    <Icon />
                  </span>
                  <CardTitle className="text-base font-semibold">{label}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs max-sm:hidden">{description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
