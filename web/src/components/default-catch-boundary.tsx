import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { BackOrHomeButton, StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

/**
 * The error screen for any route without its own `errorComponent`. "Try
 * again" re-runs the failed loaders and clears the boundary; the error's
 * message only shows in development, since it can name internals.
 */
export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);

  // Logged once per error, not on every render.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="This page didn't load"
      description="Something went wrong on our side. Try again, and if it keeps happening, reload the page."
      detail={
        import.meta.env.DEV &&
        message && (
          <pre className="max-w-xl overflow-x-auto rounded-lg border bg-muted px-3 py-2 text-left text-xs whitespace-pre-wrap text-muted-foreground">
            {message}
          </pre>
        )
      }
    >
      <Button onClick={() => router.invalidate()}>Try again</Button>
      <BackOrHomeButton />
    </StatusPage>
  );
}
