import type { UpcomingDay } from "@dueboard/api/rpc";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import type { LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";

// Upcoming: tasks, habits and goals for the coming days, fetched in pages of
// days. A task, habit or goal write refetches the pages on screen.

/** Days per "Load more days". `GetUpcoming` takes up to 60. */
export const UPCOMING_PAGE_DAYS = 14;

const UPCOMING_KEYS = ["tasks", "habits", "goals"];

/**
 * The first `pages` pages of Upcoming from `from`, joined. Each page is its
 * own query atom, so "Load more days" only fetches the new one. `until` is
 * the first day not covered yet.
 */
export const upcomingAtom = Atom.family(({ from, pages }: { from: LocalDate; pages: number }) =>
  Atom.make((get) =>
    Effect.gen(function* () {
      const days: UpcomingDay[] = [];
      let start = from;
      for (let page = 0; page < pages; page++) {
        const result = yield* get.result(
          ApiClient.query("GetUpcoming", { from: start, days: UPCOMING_PAGE_DAYS }, { reactivityKeys: UPCOMING_KEYS }),
        );
        days.push(...result.days);
        start = result.until;
      }
      return { days, until: start };
    }),
  ),
);
