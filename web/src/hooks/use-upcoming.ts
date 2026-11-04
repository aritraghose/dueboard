import type { UpcomingDay } from "@dueboard/api/rpc";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import type { LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";

export const UPCOMING_PAGE_DAYS = 14;

const UPCOMING_KEYS = ["tasks", "habits", "goals"];

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
