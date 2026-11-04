import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { TiboAside, TiboBubble } from "@/components/tibo-aside";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "../../auth-client.ts";
import { SITE_DESCRIPTION, seo } from "@/lib/seo";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_auth/auth")({
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (user) throw redirect({ to: user.username ? "/now" : "/onboarding" });
  },
  head: () => ({
    meta: seo({ title: "Sign in · Dueboard", description: SITE_DESCRIPTION, path: "/auth", noindex: true }),
  }),
  component: SignIn,
});

function SignIn() {
  const { error: callbackError } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? "Google sign-in didn't complete. Please try again." : null,
  );

  const signIn = async () => {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/now",
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/auth",
    });
    if (error) {
      setPending(false);
      setError("Couldn't start Google sign-in. Please try again.");
    }
  };

  return (
    <>
      <section className="flex w-full max-w-md flex-col gap-8 max-lg:mx-auto max-lg:pt-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-headline font-[650] text-balance">Sign in to Dueboard</h1>
          <p className="text-lede text-pretty text-muted-foreground">
            Your board, your streaks and Tibo are on the other side of this button.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={signIn}
            disabled={pending}
            className="h-13 gap-3 rounded-full bg-card text-base shadow-(--card-shadow) [&_svg]:size-5!"
          >
            {pending ? <Spinner /> : <GoogleMark />}
            Continue with Google
          </Button>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <p className="border-t pt-6 text-sm text-pretty text-muted-foreground">
          New here? The same button sets you up. You'll pick a username next, then you're on your board.
        </p>
      </section>

      <TiboAside label="Tibo says hi">
        <div className="flex flex-col gap-2.5">
          <TiboBubble delay={150}>Oh, hi.</TiboBubble>
          <TiboBubble delay={900}>I'm Tibo. I live in Dueboard and keep your day in order.</TiboBubble>
          <TiboBubble delay={1700}>
            Sign in and we'll plan today together. I already have ideas. Some of them are good.
          </TiboBubble>
        </div>
      </TiboAside>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 256 262" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
      />
      <path
        fill="#34A853"
        d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
      />
      <path
        fill="#FBBC05"
        d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
      />
      <path
        fill="#EB4335"
        d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
      />
    </svg>
  );
}
