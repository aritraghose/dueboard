import {
  PEOPLE_SEARCH_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  type ConnectionState,
} from "./model.ts";

// Pure rules for connections, blocks and people search (`social.ts`).

/**
 * A connection's key: the two ids in byte order, as `connections` stores
 * them (its `CHECK` compares with `collate "C"`, which agrees with `<` here).
 */
export const orderedPair = (a: string, b: string): readonly [low: string, high: string] =>
  a < b ? [a, b] : [b, a];

const USERNAME_CHARS = /^[a-z0-9_.]+$/;

/**
 * A typed username in the form Better Auth stores it: without a leading
 * `@`, trimmed and lowercased. `null` when it can't be a username.
 */
export const normalizeUsername = (input: string): string | null => {
  const value = input.trim().replace(/^@/, "").toLowerCase();
  if (value.length < USERNAME_MIN_LENGTH || value.length > USERNAME_MAX_LENGTH) return null;
  return USERNAME_CHARS.test(value) ? value : null;
};

/**
 * People search's patterns for what the user typed: a username prefix
 * (`LIKE`, `_` escaped; `null` when the text can't start a username) and a
 * name match anywhere (`ILIKE`, spaces collapsed, wildcards escaped).
 * `null` overall when it's shorter than `PEOPLE_SEARCH_MIN_LENGTH`.
 */
export const searchPatterns = (
  input: string,
): { readonly exact: string; readonly username: string | null; readonly name: string } | null => {
  const text = input.trim().replace(/\s+/g, " ");
  const handle = text.replace(/^@/, "").toLowerCase();
  if (handle.length < PEOPLE_SEARCH_MIN_LENGTH) return null;
  const username =
    handle.length <= USERNAME_MAX_LENGTH && USERNAME_CHARS.test(handle)
      ? `${handle.replace(/_/g, "\\_")}%`
      : null;
  return { exact: handle, username, name: `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
};

/** What `connectionState` reads, from the viewer's side. */
export interface PairFacts {
  readonly self: boolean;
  readonly viewerBlocked: boolean;
  readonly connected: boolean;
  readonly pendingOut: boolean;
  readonly pendingIn: boolean;
}

/**
 * Where the viewer stands. A block the viewer made wins over everything
 * else (blocking removes the connection and pending requests anyway); a
 * block the other user made never reaches here, since they're not shown.
 */
export const connectionState = (facts: PairFacts): ConnectionState => {
  if (facts.self) return "self";
  if (facts.viewerBlocked) return "blocked";
  if (facts.connected) return "connected";
  if (facts.pendingIn) return "pending_in";
  if (facts.pendingOut) return "pending_out";
  return "none";
};
