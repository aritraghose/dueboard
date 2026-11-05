import { HANDLE_LOOKUP_MAX_LENGTH, PEOPLE_SEARCH_MIN_LENGTH, type ConnectionState } from "./model.ts";

export const orderedPair = (a: string, b: string): readonly [low: string, high: string] =>
  a < b ? [a, b] : [b, a];

// Lookups accept any handle ever issued: before the Twitter-style rules (username-rules.ts),
// usernames could be 3–30 characters and contain dots.
const HANDLE_LOOKUP_MIN_LENGTH = 3;
const USERNAME_CHARS = /^[a-z0-9_.]+$/;

export const normalizeUsername = (input: string): string | null => {
  const value = input.trim().replace(/^@/, "").toLowerCase();
  if (value.length < HANDLE_LOOKUP_MIN_LENGTH || value.length > HANDLE_LOOKUP_MAX_LENGTH) return null;
  return USERNAME_CHARS.test(value) ? value : null;
};

export const searchPatterns = (
  input: string,
): { readonly exact: string; readonly username: string | null; readonly name: string } | null => {
  const text = input.trim().replace(/\s+/g, " ");
  const handle = text.replace(/^@/, "").toLowerCase();
  if (handle.length < PEOPLE_SEARCH_MIN_LENGTH) return null;
  const username =
    handle.length <= HANDLE_LOOKUP_MAX_LENGTH && USERNAME_CHARS.test(handle)
      ? `${handle.replace(/_/g, "\\_")}%`
      : null;
  return { exact: handle, username, name: `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
};

export interface PairFacts {
  readonly self: boolean;
  readonly viewerBlocked: boolean;
  readonly connected: boolean;
  readonly pendingOut: boolean;
  readonly pendingIn: boolean;
}

export const connectionState = (facts: PairFacts): ConnectionState => {
  if (facts.self) return "self";
  if (facts.viewerBlocked) return "blocked";
  if (facts.connected) return "connected";
  if (facts.pendingIn) return "pending_in";
  if (facts.pendingOut) return "pending_out";
  return "none";
};
