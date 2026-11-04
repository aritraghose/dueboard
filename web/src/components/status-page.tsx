import { Link, rootRouteId, useCanGoBack, useMatch, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StatusPage({
  title,
  description,
  detail,
  children,
}: {
  title: string;
  description: string;
  detail?: ReactNode;
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

export function useIsRootMatch() {
  return useMatch({ strict: false, select: (match) => match.routeId === rootRouteId });
}
