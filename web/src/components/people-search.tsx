import { PEOPLE_SEARCH_MAX_LENGTH, PEOPLE_SEARCH_MIN_LENGTH, type Person } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { SearchIcon, UserRoundSearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConnectionActions } from "@/components/connection-actions";
import { PersonAvatar } from "@/components/person-avatar";
import { PeopleSkeleton } from "@/components/people-lists";
import { failureMessage } from "@/hooks/use-tasks";
import { peopleSearchAtom } from "@/hooks/use-social";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 300;

/**
 * A person in a list: picture, name and @username linking to their
 * profile, then `actions`. A little smaller on phones, actions included.
 */
export function PersonRow({ person, children }: { person: Person; children?: ReactNode }) {
  return (
    <li className="-mx-1.5 flex items-center gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-tibo-soft/45 max-md:gap-2.5 max-md:py-2">
      <Link
        to="/@{$username}"
        params={{ username: person.username }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:gap-2.5"
      >
        <PersonAvatar person={person} className="size-10 ring-2 ring-bubble-tibo-border max-md:size-9" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold max-md:text-[0.8125rem]">{person.name}</span>
          <span className="truncate text-xs text-muted-foreground max-md:text-[0.6875rem]">@{person.username}</span>
        </span>
      </Link>
      {children && (
        <div className="shrink-0 max-md:[&_[data-slot=button]:not([data-size^=icon])]:h-7 max-md:[&_[data-slot=button]:not([data-size^=icon])]:gap-1 max-md:[&_[data-slot=button]:not([data-size^=icon])]:px-2.5 max-md:[&_[data-slot=button]:not([data-size^=icon])]:text-xs max-md:[&_[data-size^=icon]]:size-7">
          {children}
        </div>
      )}
    </li>
  );
}

/**
 * Find people by name (any part) or username (exact or the start of it)
 * and connect from the results: a roomy search field in the message box's
 * colors, with the results in a card below.
 */
export function PeopleSearch() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim().replace(/\s+/g, " ")), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searching = query.replace(/^@/, "").length >= PEOPLE_SEARCH_MIN_LENGTH;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 items-center rounded-2xl border border-composer-border bg-composer shadow-(--card-shadow) transition-shadow focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-ring/30 max-md:h-11">
        <SearchIcon aria-hidden="true" className="ml-4 size-[1.125rem] shrink-0 text-primary/70" />
        <input
          ref={input}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && text) {
              event.preventDefault();
              setText("");
            }
          }}
          placeholder="Search by name or @username"
          aria-label="Find people by name or username"
          autoComplete="off"
          spellCheck={false}
          maxLength={PEOPLE_SEARCH_MAX_LENGTH}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-[0.9375rem] outline-none placeholder:text-muted-foreground max-md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText("");
              input.current?.focus();
            }}
            className="mr-2 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      {searching ? (
        <Results query={query} />
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          Type at least {PEOPLE_SEARCH_MIN_LENGTH} letters. A username finds them exactly.
        </p>
      )}
    </div>
  );
}

function Results({ query }: { query: string }) {
  const result = useAtomValue(peopleSearchAtom(query));
  const card = "rounded-2xl border bg-card px-3 py-1 shadow-(--card-shadow) md:px-4";
  if (AsyncResult.isFailure(result)) {
    return (
      <div className={card}>
        <p className="py-4 text-sm text-destructive">
          {failureMessage(AsyncResult.toExit(result), "Couldn't search right now.")}
        </p>
      </div>
    );
  }
  if (!AsyncResult.isSuccess(result)) {
    return (
      <div className={card} aria-label="Searching">
        <PeopleSkeleton rows={2} />
      </div>
    );
  }
  if (result.value.length === 0) {
    return (
      <div className={cn(card, "flex items-center gap-3 py-4")}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tibo-soft text-tibo-foreground max-md:size-9">
          <UserRoundSearchIcon aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground max-md:text-[0.8125rem]">
          No one's name or username matches “{query}”.
        </p>
      </div>
    );
  }
  return (
    <div className={card}>
      <ul aria-label="People found" className="divide-y">
        {result.value.map(({ person, status }) => (
          <PersonRow key={person.username} person={person}>
            <ConnectionActions username={person.username} status={status} compact />
          </PersonRow>
        ))}
      </ul>
    </div>
  );
}
