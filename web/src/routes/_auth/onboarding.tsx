import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { TiboAside, TiboBubble, TiboTyping } from "@/components/tibo-aside";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/people";
import { siteOrigin } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { authClient } from "../../auth-client.ts";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_auth/onboarding")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    if (user.username) throw redirect({ to: "/now" });
    return { user };
  },
  head: () => ({ meta: [{ title: "Pick your username · Dueboard" }, { name: "robots", content: "noindex" }] }),
  component: Onboarding,
});

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

  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const ready = Boolean(trimmed) && !invalid && availability !== "taken";

  return (
    <>
      <section className="flex w-full max-w-md flex-col gap-8 max-lg:mx-auto max-lg:pt-8">
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground">Welcome, {firstName}.</p>
          <h1 className="text-headline font-[650] text-balance">Pick your username</h1>
          <p className="text-lede text-pretty text-muted-foreground">
            It's how friends find you and how you show up on Live. You can't change it later, so pick one you'll
            like for a while.
          </p>
        </div>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <Field data-invalid={Boolean(fieldError)}>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <InputGroup className="h-13 rounded-2xl bg-card text-lg">
              <InputGroupAddon className="pl-4">
                <InputGroupText className="text-lg">@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                className="text-lg md:text-lg"
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
            disabled={!ready || saving}
            className="h-13 rounded-full text-base"
          >
            {saving && <Spinner />}
            <span className="truncate">{ready ? `Claim @${trimmed}` : "Claim username"}</span>
          </Button>
        </form>
      </section>

      <TiboAside label="How your username looks" typing={availability === "checking"}>
        <UsernamePreview
          name={user.name}
          image={user.image}
          username={trimmed && !invalid ? trimmed : null}
          availability={availability}
          invalid={Boolean(trimmed && invalid)}
        />
      </TiboAside>
    </>
  );
}

function UsernamePreview({
  name,
  image,
  username,
  availability,
  invalid,
}: {
  name: string;
  image: string | null;
  username: string | null;
  availability: Availability;
  invalid: boolean;
}) {
  const handle = username ?? "your_name";
  const host = new URL(siteOrigin()).host;
  const tibo = invalid
    ? "Letters, numbers, dots and underscores only. I don't make the rules. I do enforce them."
    : availability === "taken"
      ? "Someone got there first. Try a dot or an underscore, it works wonders."
      : availability === "available"
        ? `@${username}. I can work with that. Very you, probably. We just met.`
        : "Take your time. I'll be saying it a lot.";

  return (
    <div className="flex flex-col gap-5">
      {availability === "checking" ? (
        <TiboTyping />
      ) : (
        <TiboBubble key={tibo} className="duration-300">
          {tibo}
        </TiboBubble>
      )}

      <div data-tag="teal" className="overflow-hidden rounded-2xl border bg-background/60">
        <div aria-hidden="true" className="profile-band h-20" />
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Avatar className="-mt-8 size-16 ring-4 ring-card">
            {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="text-lg font-semibold">{initials(name, handle)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-semibold">{name}</span>
            <span className={cn("truncate font-medium", username ? "text-tag-ink" : "text-muted-foreground")}>
              @{handle}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {host}/<span className={cn(username && "font-medium text-foreground")}>@{handle}</span>
          </p>
        </div>
      </div>

      <p className="flex items-baseline gap-2 border-t pt-4 text-sm">
        <span className="shrink-0 font-medium text-muted-foreground">On Live</span>
        <span className="min-w-0 truncate">
          <span data-tag="teal" className={cn("font-semibold", username ? "text-tag-ink" : "text-muted-foreground")}>
            @{handle}
          </span>{" "}
          settled a task: Pick a username
        </span>
      </p>
    </div>
  );
}
