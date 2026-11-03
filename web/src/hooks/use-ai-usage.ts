import type { AiUsage } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useRef } from "react";
import { ApiClient } from "../rpc-client.ts";
import { useRun } from "./use-tasks.ts";

// The user's AI messages this month (`GetAiUsage`). The chat refreshes it
// after every turn by invalidating `ai-usage`, so Settings and the composer
// agree.

const AI_USAGE = ["ai-usage"];

const aiUsageAtom = ApiClient.query("GetAiUsage", undefined, { reactivityKeys: AI_USAGE });

/** The latest usage (kept while a refresh is in flight), and `refresh`. */
export function useAiUsage() {
  const run = useRun();
  const result = useAtomValue(aiUsageAtom);
  const last = useRef<AiUsage | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  const refresh = useCallback(() => void run(Reactivity.invalidate(AI_USAGE)), [run]);
  return { usage: last.current, failed: !last.current && AsyncResult.isFailure(result), refresh };
}

/** "12 of 300 messages left this month". */
export const usageLine = ({ remaining, limit }: AiUsage) =>
  `${remaining} of ${limit} ${limit === 1 ? "message" : "messages"} left this month`;

/** "Resets Dec 1" (the user's local date). */
export const resetLine = ({ resetsAt }: AiUsage) =>
  `Resets ${resetsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
