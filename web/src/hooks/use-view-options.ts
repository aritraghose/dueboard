import { useCallback, useEffect, useState } from "react";

export type ViewOptions = {
  readonly show: "all" | "tasks" | "habits" | "goals";
  readonly sort: "default" | "importance" | "minutes";
  readonly direction: "asc" | "desc";
  readonly group: "auto" | "tag" | "none";
  readonly tags: readonly string[];
};

export const DEFAULT_VIEW: ViewOptions = { show: "all", sort: "default", direction: "desc", group: "auto", tags: [] };

export function useViewOptions(key: string) {
  const storageKey = `dueboard-view-${key}`;
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setView({ ...DEFAULT_VIEW, ...(JSON.parse(stored) as Partial<ViewOptions>) });
    } catch {
    }
  }, [storageKey]);

  const update = useCallback(
    (patch: Partial<ViewOptions>) =>
      setView((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
        }
        return next;
      }),
    [storageKey],
  );

  return [view, update] as const;
}
