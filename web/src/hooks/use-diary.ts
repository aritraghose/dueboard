import type { DiaryDay, LocalDate } from "@dueboard/api/rpc";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import { ApiClient } from "../rpc-client.ts";

const DIARY_KEYS = ["tasks", "habits", "goals", "sessions", "notes", "social"];

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

export const contributionGraphAtom = Atom.family((username: string) =>
  ApiClient.query("GetContributionGraph", { username }, { reactivityKeys: DIARY_KEYS }),
);
