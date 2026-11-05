import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "./model.ts";

/**
 * Twitter-style usernames: 4–15 letters, numbers or underscores, and nothing that
 * passes for the app or its staff. Only claiming a username checks this; lookups
 * still accept handles issued under the older, looser rules.
 */
export type UsernameProblem = "too_short" | "too_long" | "space" | "dot" | "character" | "reserved" | "tibo";

const ALLOWED = /^[A-Za-z0-9_]+$/;
const RESERVED_PARTS = ["dueboard", "admin"];

export const usernameProblem = (username: string): UsernameProblem | null => {
  const lower = username.toLowerCase();
  if (/\s/.test(username)) return "space";
  if (username.includes(".")) return "dot";
  if (!ALLOWED.test(username)) return "character";
  if (username.length < USERNAME_MIN_LENGTH) return "too_short";
  if (username.length > USERNAME_MAX_LENGTH) return "too_long";
  if (lower === "tibo") return "tibo";
  if (RESERVED_PARTS.some((part) => lower.includes(part))) return "reserved";
  return null;
};

export const isValidUsername = (username: string): boolean => usernameProblem(username) === null;
