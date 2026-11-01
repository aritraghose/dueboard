import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "../../auth-client.ts";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_auth/onboarding")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    if (user.username) throw redirect({ to: "/now" });
    return { user };
  },
  component: Onboarding,
});

// The same rules Better Auth's `username` plugin enforces on the server.
const MIN = 3;
const MAX = 30;
const ALLOWED = /^[a-zA-Z0-9_.]+$/;

function validate(username: string): string | null {
  if (username.length < MIN) return `Use at least ${MIN} characters.`;
  if (username.length > MAX) return `Use at most ${MAX} characters.`;
  if (!ALLOWED.test(username)) return "Use only letters, numbers, underscores and dots.";
  return null;
}

type Availability = "checking" | "available" | "taken" | null;

function Onboarding() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState<Availability>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = username.trim();
  const invalid = trimmed ? validate(trimmed) : null;

  // Check availability as the user types (debounced). The server checks
  // again on save, so this only gives early feedback.
  useEffect(() => {
    if (!trimmed || invalid) {
      setAvailability(null);
      return;
    }
    setAvailability("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await authClient.isUsernameAvailable({ username: trimmed });
      if (!cancelled) setAvailability(data ? (data.available ? "available" : "taken") : null);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, invalid]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || invalid) return;
    setSaving(true);
    setError(null);
    const { error } = await authClient.updateUser({ username: trimmed });
    if (error) {
      setSaving(false);
      setError(error.message ?? "Couldn't save that username. Please try again.");
      if (error.code === "USERNAME_IS_ALREADY_TAKEN") setAvailability("taken");
      return;
    }
    await navigate({ to: "/now" });
  };

  const fieldError = invalid ?? (availability === "taken" ? "That username is taken." : null);
  const hint =
    availability === "available"
      ? "That username is available."
      : availability === "checking"
        ? "Checking…"
        : `${MIN}–${MAX} characters: letters, numbers, underscores and dots.`;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardDescription>Welcome, {user.name}</CardDescription>
        <CardTitle className="font-heading text-2xl">Choose a username</CardTitle>
        <CardDescription>This is how you'll appear in the app. It must be unique.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field data-invalid={Boolean(fieldError)}>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your_name"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={MAX}
                autoFocus
                aria-invalid={Boolean(fieldError)}
                aria-describedby="username-hint"
              />
            </InputGroup>
            {/* Announced politely: FieldError's own role="alert" would
                interrupt on every keystroke. */}
            <div id="username-hint" aria-live="polite">
              {fieldError ? (
                <FieldError role={undefined}>{fieldError}</FieldError>
              ) : (
                <FieldDescription>{hint}</FieldDescription>
              )}
            </div>
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={!trimmed || Boolean(invalid) || availability === "taken" || saving}
          >
            {saving && <Spinner />}
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
