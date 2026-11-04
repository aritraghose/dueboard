import { TIBO_AGENT, TIBO_MEMORIES_PATH, type TiboMemory } from "@dueboard/api/tibo";
import { useCallback, useEffect, useState } from "react";

const memoriesUrl = (id?: string) =>
  `/agents/${TIBO_AGENT}/me/${TIBO_MEMORIES_PATH}${id ? `/${encodeURIComponent(id)}` : ""}`;

export type TiboMemoriesState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly memories: readonly TiboMemory[] };

export function useTiboMemories() {
  const [state, setState] = useState<TiboMemoriesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(memoriesUrl())
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { memories } = (await response.json()) as { memories: TiboMemory[] };
        if (!cancelled) setState({ status: "ready", memories });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = useCallback(async (memory: TiboMemory): Promise<boolean> => {
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", memories: current.memories.filter((other) => other.id !== memory.id) }
        : current,
    );
    const response = await fetch(memoriesUrl(memory.id), { method: "DELETE" }).catch(() => null);
    if (response && (response.ok || response.status === 404)) return true;
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            memories: [...current.memories, memory].sort((a, b) => b.createdAt - a.createdAt),
          }
        : current,
    );
    return false;
  }, []);

  return { state, remove };
}
