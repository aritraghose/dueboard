import type {
  LeaderboardPeriod,
  LeaderboardScope,
  ProfileFeed,
  ProfileItem,
  SocialStatus,
} from "@dueboard/api/rpc";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Atom from "effect/reactivity/Atom";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ApiClient } from "../rpc-client.ts";
import { failureMessage, useRun } from "./use-tasks.ts";

const SOCIAL = ["social"];

export const profileAtom = Atom.family((username: string) =>
  ApiClient.query("GetProfile", { username }, { reactivityKeys: SOCIAL }),
);

export const socialOverviewAtom = ApiClient.query("GetSocialOverview", undefined, {
  reactivityKeys: SOCIAL,
});

export const peopleSearchAtom = Atom.family((query: string) =>
  ApiClient.query("SearchPeople", { query }, { reactivityKeys: SOCIAL }),
);

export const profileItemsAtom = Atom.family(
  ({ username, feed, pages }: { username: string; feed: ProfileFeed; pages: number }) =>
    Atom.make((get) =>
      Effect.gen(function* () {
        const items: ProfileItem[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < pages; page++) {
          const result = yield* get.result(
            ApiClient.query(
              "GetProfileItems",
              cursor ? { username, feed, cursor } : { username, feed },
              { reactivityKeys: SOCIAL },
            ),
          );
          items.push(...result.items);
          if (!result.nextCursor) return { items, nextCursor: null };
          cursor = result.nextCursor;
        }
        return { items, nextCursor: cursor ?? null };
      }),
    ),
);

export const leaderboardAtom = Atom.family(
  ({ scope, period }: { scope: LeaderboardScope; period: LeaderboardPeriod }) =>
    ApiClient.query("GetLeaderboard", { scope, period }, { reactivityKeys: SOCIAL }),
);

type Action = "send" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";

const DONE: Record<Action, (username: string) => string> = {
  send: (u) => `Request sent to @${u}.`,
  accept: (u) => `You're connected with @${u}.`,
  decline: (u) => `Declined @${u}'s request.`,
  cancel: (u) => `Request to @${u} cancelled.`,
  remove: (u) => `Removed @${u} from your connections.`,
  block: (u) => `Blocked @${u}.`,
  unblock: (u) => `Unblocked @${u}.`,
};

const FAILED: Record<Action, string> = {
  send: "Couldn't send the request.",
  accept: "Couldn't accept the request.",
  decline: "Couldn't decline the request.",
  cancel: "Couldn't cancel the request.",
  remove: "Couldn't remove the connection.",
  block: "Couldn't block them.",
  unblock: "Couldn't unblock them.",
};

export function useSocialActions() {
  const run = useRun();

  const act = useCallback(
    async (action: Action, username: string, call: () => Promise<Exit.Exit<SocialStatus, unknown>>) => {
      const exit = await call();
      if (Exit.isSuccess(exit)) {
        const connectedNow = action === "send" && exit.value.state === "connected";
        toast.success(DONE[connectedNow ? "accept" : action](username));
      } else {
        toast.error(failureMessage(exit, FAILED[action]));
      }
      return exit;
    },
    [],
  );

  return useMemo(() => {
    const byName = (rpc: "SendConnectionRequest" | "RemoveConnection" | "BlockUser" | "UnblockUser") =>
      (username: string) =>
        run(ApiClient.use((client) => client(rpc, { username })).pipe(Reactivity.mutation(SOCIAL)));
    const byRequest = (
      rpc: "AcceptConnectionRequest" | "DeclineConnectionRequest" | "CancelConnectionRequest",
    ) =>
      (requestId: string) =>
        run(ApiClient.use((client) => client(rpc, { requestId })).pipe(Reactivity.mutation(SOCIAL)));
    const send = byName("SendConnectionRequest");
    const remove = byName("RemoveConnection");
    const block = byName("BlockUser");
    const unblock = byName("UnblockUser");
    const accept = byRequest("AcceptConnectionRequest");
    const decline = byRequest("DeclineConnectionRequest");
    const cancel = byRequest("CancelConnectionRequest");
    return {
      send: (username: string) => act("send", username, () => send(username)),
      remove: (username: string) => act("remove", username, () => remove(username)),
      block: (username: string) => act("block", username, () => block(username)),
      unblock: (username: string) => act("unblock", username, () => unblock(username)),
      accept: (username: string, requestId: string) => act("accept", username, () => accept(requestId)),
      decline: (username: string, requestId: string) => act("decline", username, () => decline(requestId)),
      cancel: (username: string, requestId: string) => act("cancel", username, () => cancel(requestId)),
      reload: () => run(Reactivity.invalidate(SOCIAL)),
    };
  }, [run, act]);
}
