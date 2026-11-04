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

const ASK = ["ask"];

export const askPageAtom = Atom.family((username: string) =>
  ApiClient.query("GetAskPage", { username }, { reactivityKeys: ASK }),
);

export const askSettingsAtom = ApiClient.query("GetAskSettings", undefined, { reactivityKeys: ASK });
export const askQuestionsAtom = ApiClient.query("ListAskQuestions", undefined, { reactivityKeys: ASK });

export function useUpdateAskSettings() {
  const run = useRun();
  return useCallback(
    (patch: AskSettingsPatch) =>
      run(
        ApiClient.use((client) => client("UpdateAskSettings", patch)).pipe(
          Reactivity.mutation([...ASK, "social"]),
        ),
      ),
    [run],
  );
}

export const CONVERT_ERROR: Record<Exclude<AskConversion, { ok: true }>["error"] | "network", string> = {
  not_pdf: "That isn't a PDF. Pick a .pdf file.",
  too_large: "That PDF is over 4 MB. Try a smaller one.",
  empty: "Couldn't find any text in that PDF. Scanned pages without text can't be read yet.",
  failed: "Couldn't read that PDF. Try again, or try another file.",
  limited: "You've added several files in a row. Wait a minute and try again.",
  network: "Couldn't upload that file. Check your connection and try again.",
};

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

export type AskError = AskRefusal | "network";

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

