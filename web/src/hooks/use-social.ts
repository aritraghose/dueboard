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

// Profiles, connections, requests, blocks and people search. Every read
// carries the `social` reactivity key and every write invalidates it, so a
// profile, the Connections tab and search results all agree after a click.

const SOCIAL = ["social"];

/** `/@username`, for any viewer (signed in or not). */
export const profileAtom = Atom.family((username: string) =>
  ApiClient.query("GetProfile", { username }, { reactivityKeys: SOCIAL }),
);

/** Settings' Connections tab. */
export const socialOverviewAtom = ApiClient.query("GetSocialOverview", undefined, {
  reactivityKeys: SOCIAL,
});

/** People search for a (debounced) query of two characters or more. */
export const peopleSearchAtom = Atom.family((query: string) =>
  ApiClient.query("SearchPeople", { query }, { reactivityKeys: SOCIAL }),
);

/**
 * A profile tab's first `pages` pages, joined. Each page is its own query
 * atom (with the `social` key), so "Load more" fetches only the new page.
 */
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

/** The leaderboard for a scope and period; fetched again whenever the page opens. */
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

/**
 * The social writes. Each takes the other person's username (and the
 * request id where one is needed), toasts its outcome and resolves to the
 * call's `Exit`. Sending to someone who already asked connects at once,
 * and the toast says so.
 */
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
      /** Refetches every social read on screen, failed ones included ("Try again"). */
      reload: () => run(Reactivity.invalidate(SOCIAL)),
    };
  }, [run, act]);
}
