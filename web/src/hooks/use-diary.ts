import type { DiaryDay, LocalDate } from "@dueboard/api/rpc";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import { ApiClient } from "../rpc-client.ts";

// Diaries (`GetDiary`) and contribution graphs (`GetContributionGraph`), for
// `/diary` and `/@username`. They carry every write's key, so the user's own
// diary and graph follow their changes (and privacy edits) at once.

const DIARY_KEYS = ["tasks", "habits", "goals", "sessions", "notes", "social"];

/**
 * A diary's first `pages` pages from `from` (or the newest day), joined.
 * Each page is its own query atom, so "Load more" fetches only the new one.
 */
export const diaryAtom = Atom.family(
  ({ username, from, pages }: { username: string; from: LocalDate | null; pages: number }) =>
    Atom.make((get) =>
      Effect.gen(function* () {
        const days: DiaryDay[] = [];
        let cursor: LocalDate | undefined;
        for (let page = 0; page < pages; page++) {
          const result = yield* get.result(
            ApiClient.query(
              "GetDiary",
              { username, ...(from ? { from } : {}), ...(cursor ? { cursor } : {}) },
              { reactivityKeys: DIARY_KEYS },
            ),
          );
          days.push(...result.days);
          if (!result.nextCursor) return { days, nextCursor: null };
          cursor = result.nextCursor;
        }
        return { days, nextCursor: cursor ?? null };
      }),
    ),
);

/** The last 53 weeks of `username`'s graph. */
export const contributionGraphAtom = Atom.family((username: string) =>
  ApiClient.query("GetContributionGraph", { username }, { reactivityKeys: DIARY_KEYS }),
);
