import {
  ASK_AGENT,
  ASK_DOCUMENT_CONVERT_PATH,
  ASK_QUESTION_PATH,
  ASK_THREAD_PATH,
  type AskConversion,
  type AskExchange,
  type AskRefusal,
  type AskResponse,
  type AskThread,
} from "@dueboard/api/ask";
import type { AskSettingsPatch } from "@dueboard/api/rpc";
import * as Atom from "effect/reactivity/Atom";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClient } from "../rpc-client.ts";
import { useRun } from "./use-tasks.ts";

// The Ask page (architecture.md §7.6). The page's card comes from the
// public `GetAskPage` RPC; the visitor's thread and questions go to the
// owner's Ask agent over HTTP, through the website's
// `/agents/ask-agent/<username>/…` proxy, which picks the agent instance from
// the visitor's session or cookie. Settings → Ask page uses the RPCs below.

const ASK = ["ask"];

/** `/@username/ask`'s card and whether the viewer can ask. */
export const askPageAtom = Atom.family((username: string) =>
  ApiClient.query("GetAskPage", { username }, { reactivityKeys: ASK }),
);

/** Settings → Ask page. */
export const askSettingsAtom = ApiClient.query("GetAskSettings", undefined, { reactivityKeys: ASK });
export const askQuestionsAtom = ApiClient.query("ListAskQuestions", undefined, { reactivityKeys: ASK });

/** Saves an Ask settings change; resolves to the call's `Exit` (the queries refresh). */
export function useUpdateAskSettings() {
  const run = useRun();
  return useCallback(
    (patch: AskSettingsPatch) =>
      run(
        // Profiles show "Ask Tibo" only while it's on, so they refresh too.
        ApiClient.use((client) => client("UpdateAskSettings", patch)).pipe(
          Reactivity.mutation([...ASK, "social"]),
        ),
      ),
    [run],
  );
}

/** Why a PDF couldn't be read, as Settings says it. */
export const CONVERT_ERROR: Record<Exclude<AskConversion, { ok: true }>["error"] | "network", string> = {
  not_pdf: "That isn't a PDF. Pick a .pdf file.",
  too_large: "That PDF is over 4 MB. Try a smaller one.",
  empty: "Couldn't find any text in that PDF. Scanned pages without text can't be read yet.",
  failed: "Couldn't read that PDF. Try again, or try another file.",
  limited: "You've added several files in a row. Wait a minute and try again.",
  network: "Couldn't upload that file. Check your connection and try again.",
};

/**
 * Files on the user's Ask page: `convert` sends a PDF to the website, which
 * turns it into text and keeps nothing; `add` saves the reviewed text
 * (`AddAskDocument`); `remove` deletes one. Both writes refresh the settings.
 */
export function useAskDocuments() {
  const run = useRun();
  const convert = useCallback(async (file: File): Promise<AskConversion | { ok: false; error: "network" }> => {
    try {
      const response = await fetch(ASK_DOCUMENT_CONVERT_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const result = (await response.json().catch(() => null)) as AskConversion | null;
      return result ?? { ok: false, error: response.status === 413 ? "too_large" : "failed" };
    } catch {
      return { ok: false, error: "network" };
    }
  }, []);
  const add = useCallback(
    (name: string, text: string) =>
      run(ApiClient.use((client) => client("AddAskDocument", { name, text })).pipe(Reactivity.mutation(ASK))),
    [run],
  );
  const remove = useCallback(
    (id: string) =>
      run(ApiClient.use((client) => client("DeleteAskDocument", { id })).pipe(Reactivity.mutation(ASK))),
    [run],
  );
  return { convert, add, remove };
}

const askUrl = (username: string, path: string) =>
  `/agents/${ASK_AGENT}/${encodeURIComponent(username)}/${path}`;

export type AskThreadState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly exchanges: readonly AskExchange[];
      readonly needsVerification: boolean;
      readonly siteKey: string;
    };

/** Why a question got no answer, as the page shows it; `network` when the request itself failed. */
export type AskError = AskRefusal | "network";

/**
 * This visitor's thread with `username`'s Ask page, and `ask`. A question
 * shows at once as pending; on an answer it becomes an exchange, on a
 * refusal it's handed back (so the composer can restore it).
 */
export function useAskThread(username: string, enabled: boolean) {
  const [state, setState] = useState<AskThreadState>({ status: "loading" });
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetch(askUrl(username, ASK_THREAD_PATH), { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const thread = (await response.json()) as AskThread;
        if (!cancelled) setState({ status: "ready", ...thread });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [username, enabled]);

  const ask = useCallback(
    async (question: string, token?: string): Promise<{ ok: true } | { ok: false; error: AskError }> => {
      if (busy.current) return { ok: false, error: "busy" };
      busy.current = true;
      setPending(question);
      try {
        const response = await fetch(askUrl(username, ASK_QUESTION_PATH), {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(token ? { question, token } : { question }),
        });
        const result = (await response.json().catch(() => null)) as AskResponse | null;
        if (!result) return { ok: false, error: response.status === 429 ? "limited" : "network" };
        if (!result.ok) {
          // A passed check counts even when the question itself was refused.
          setState((current) =>
            current.status === "ready" ? { ...current, needsVerification: result.needsVerification } : current,
          );
          return { ok: false, error: result.error };
        }
        setState((current) =>
          current.status === "ready"
            ? { ...current, needsVerification: false, exchanges: [...current.exchanges, result.exchange] }
            : current,
        );
        return { ok: true };
      } catch {
        return { ok: false, error: "network" };
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [username],
  );

  return { state, pending, ask };
}

