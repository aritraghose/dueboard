import { Link, rootRouteId, useCanGoBack, useMatch, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The page behind the error and not-found screens: the logo, what happened,
 * and what to do next. At the root there's no layout around it, so it fills
 * the window; inside a layout (the app shell) it fills the page area.
 */
export function StatusPage({
  title,
  description,
  detail,
  children,
}: {
  title: string;
  description: string;
  /** Extra detail below the description, such as the error in development. */
  detail?: ReactNode;
  /** The actions, usually from `StatusActions`. */
  children: ReactNode;
}) {
  const isRoot = useIsRootMatch();
  return (
    <main
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center",
        isRoot ? "min-h-svh" : "min-h-96",
      )}
    >
      <AppLogo className="size-16" />
      <div className="flex max-w-md flex-col items-center gap-2">
        <h1 className="text-title font-semibold text-balance">{title}</h1>
        <p className="text-pretty text-muted-foreground">{description}</p>
      </div>
      {detail}
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
    </main>
  );
}

/**
 * "Go back" when there's a page to go back to inside Dueboard, otherwise a
 * link to the landing page (which sends signed-in users on to the app).
 */
export function BackOrHomeButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  if (canGoBack) {
    return (
      <Button variant={variant} onClick={() => router.history.back()}>
        Go back
      </Button>
    );
  }
  return (
    <Button asChild variant={variant}>
      <Link to="/">Go to Dueboard</Link>
    </Button>
  );
}

/** Whether this screen replaced the root route, so no layout surrounds it. */
export function useIsRootMatch() {
  // `match.id` adds the path to the route id (`__root__/`), so compare `routeId`.
  return useMatch({ strict: false, select: (match) => match.routeId === rootRouteId });
}
