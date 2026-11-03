import { PEOPLE_SEARCH_MAX_LENGTH, PEOPLE_SEARCH_MIN_LENGTH, type Person } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { SearchIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ConnectionActions } from "@/components/connection-actions";
import { PersonAvatar } from "@/components/person-avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { failureMessage } from "@/hooks/use-tasks";
import { peopleSearchAtom } from "@/hooks/use-social";

const DEBOUNCE_MS = 300;

/** A person in a list: picture, name and @username linking to their profile, then `actions`. */
export function PersonRow({ person, children }: { person: Person; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Link
        to="/@{$username}"
        params={{ username: person.username }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PersonAvatar person={person} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{person.name}</span>
          <span className="truncate text-sm text-muted-foreground">@{person.username}</span>
        </span>
      </Link>
      {children && <div className="shrink-0">{children}</div>}
    </li>
  );
}

/** Find people by name (any part) or username (exact or the start of it) and connect from the results. */
export function PeopleSearch() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim().replace(/\s+/g, " ")), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Find people by name or username"
          aria-label="Find people by name or username"
          autoComplete="off"
          spellCheck={false}
          maxLength={PEOPLE_SEARCH_MAX_LENGTH}
        />
      </InputGroup>
      {query.replace(/^@/, "").length >= PEOPLE_SEARCH_MIN_LENGTH && <Results query={query} />}
    </div>
  );
}

function Results({ query }: { query: string }) {
  const result = useAtomValue(peopleSearchAtom(query));
  if (AsyncResult.isFailure(result)) {
    return (
      <p className="px-1 text-sm text-destructive">
        {failureMessage(AsyncResult.toExit(result), "Couldn't search right now.")}
      </p>
    );
  }
  if (!AsyncResult.isSuccess(result)) {
    return (
      <div className="flex items-center gap-3 px-1 py-2.5">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }
  if (result.value.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">No one's name or username matches "{query}".</p>;
  }
  return (
    <ul className="divide-y px-1">
      {result.value.map(({ person, status }) => (
        <PersonRow key={person.username} person={person}>
          <ConnectionActions username={person.username} status={status} compact />
        </PersonRow>
      ))}
    </ul>
  );
}
