import { useCallback, useEffect, useState } from "react";

/** What a list shows and how it orders and groups it. */
export type ViewOptions = {
  /** Which kinds of items show (`/now` only). */
  readonly show: "all" | "tasks" | "habits" | "goals";
  /** `default` keeps the list's own order (oldest first on `/now`, newest on `/tasks`). */
  readonly sort: "default" | "importance" | "minutes";
  readonly direction: "asc" | "desc";
  /** `auto` groups by day where the list has days (`/tasks` Upcoming and Settled). */
  readonly group: "auto" | "tag" | "none";
  /** Tag ids to filter by (`/now` only; `/tasks` keeps them in its URL). Empty means any tag. */
  readonly tags: readonly string[];
};

export const DEFAULT_VIEW: ViewOptions = { show: "all", sort: "default", direction: "desc", group: "auto", tags: [] };

/**
 * A page's view options, remembered per viewer in localStorage under `key`.
 * Read after mount, so the server render and hydration agree.
 */
export function useViewOptions(key: string) {
  const storageKey = `dueboard-view-${key}`;
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setView({ ...DEFAULT_VIEW, ...(JSON.parse(stored) as Partial<ViewOptions>) });
    } catch {
      // Storage blocked or unreadable: keep the defaults.
    }
  }, [storageKey]);

  const update = useCallback(
    (patch: Partial<ViewOptions>) =>
      setView((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Not remembered this time; the view still changes.
        }
        return next;
      }),
    [storageKey],
  );

  return [view, update] as const;
}
