import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../auth-client.ts";
import { getSessionUser } from "../session.ts";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/sign-in" });
    if (user.username) throw redirect({ to: "/" });
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
    await navigate({ to: "/" });
  };

  const hint =
    invalid ??
    (availability === "taken"
      ? "That username is taken."
      : availability === "available"
        ? "That username is available."
        : availability === "checking"
          ? "Checking…"
          : `${MIN}–${MAX} characters: letters, numbers, underscores and dots.`);

  return (
    <main className="page page-narrow">
      <header className="hero">
        <p className="eyebrow">Welcome, {user.name}</p>
        <h1 className="title">Choose a username</h1>
        <p className="subtitle">This is how you'll appear in the app. It must be unique.</p>
      </header>

      <form className="card panel" onSubmit={submit}>
        <label className="field-label" htmlFor="username">
          Username
        </label>
        <div className="field-row">
          <span className="field-prefix" aria-hidden="true">
            @
          </span>
          <input
            id="username"
            className="composer-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your_name"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={MAX}
            autoFocus
            aria-invalid={Boolean(invalid) || availability === "taken"}
            aria-describedby="username-hint"
          />
        </div>
        <p
          id="username-hint"
          className="field-hint"
          data-state={invalid || availability === "taken" ? "error" : availability ?? undefined}
          aria-live="polite"
        >
          {hint}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button-primary button-block"
          disabled={!trimmed || Boolean(invalid) || availability === "taken" || saving}
        >
          {saving && <span className="spinner" aria-hidden="true" />}
          Continue
        </button>
      </form>
    </main>
  );
}
