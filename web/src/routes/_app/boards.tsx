import { Link, createFileRoute, type LinkProps } from "@tanstack/react-router";
import { UserRoundIcon, type LucideIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BOARDS, BOARD_EXTRAS } from "@/lib/nav";

/** Every board as a card, then Profile, Leaderboard, Discover and Settings; each card opens its page. */
export const Route = createFileRoute("/_app/boards")({
  head: () => ({ meta: [{ title: "Boards · Dueboard" }] }),
  component: Boards,
});

type BoardCard = {
  readonly key: string;
  readonly link: LinkProps;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
};

function Boards() {
  const { user } = Route.useRouteContext();
  const cards: BoardCard[] = [
    ...BOARDS.map((board) => ({ key: board.to, link: { to: board.to }, ...board })),
    {
      key: "profile",
      link: { to: "/@{$username}", params: { username: user.username } },
      label: "Profile",
      icon: UserRoundIcon,
      description: "Your page, as other people see it.",
    },
    ...BOARD_EXTRAS.map((extra) => ({ key: extra.to, link: { to: extra.to }, ...extra })),
  ];

  return (
    <Page>
      <PageHeader title="Boards" description="Everything you keep track of, one board each." />
      {/*
        Square cards, close together, sized to the window: ten of them, in
        rows of two on narrow screens and five from `md`, so no card is left alone
        on a row. The cap keeps each card at most 13rem wide.
      */}
      <ul className="mx-auto grid w-full max-w-[27rem] grid-cols-2 gap-2.5 md:max-w-[67rem] md:grid-cols-5 md:gap-3">
        {cards.map(({ key, link, label, description, icon: Icon }) => (
          <li key={key}>
            <Link
              {...link}
              className="group block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="aspect-square justify-center rounded-2xl transition-colors group-hover:ring-foreground/25 [--card-spacing:--spacing(3)] sm:[--card-spacing:--spacing(4)]">
                <CardHeader className="justify-items-center gap-2 text-center">
                  <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground [&_svg]:size-5.5">
                    <Icon />
                  </span>
                  <CardTitle className="text-base font-semibold">{label}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs max-lg:hidden">{description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
