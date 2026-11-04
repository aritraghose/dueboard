import {
  TIBO_ACTIVITY_PATH,
  TIBO_AGENT,
  TIBO_FILES_PATH,
  currentActivity,
  type TiboActivity,
  type TiboActivityThread,
  type TiboSentFile,
} from "@dueboard/api/tibo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTiboThread } from "@/hooks/use-tibo";

const agentUrl = (path: string) => `/agents/${TIBO_AGENT}/me/${path}`;

export function useCurrentActivity(): { current: TiboActivity | null; thread: TiboActivityThread | null } {
  const { activities } = useTiboThread();
  return useMemo(() => {
    const all = Object.values(activities);
    const current = currentActivity(all);
    if (!current) return { current: null, thread: null };
    const parentId = current.parentId ?? current.id;
    const parent = activities[parentId];
    const steps = all.filter((activity) => activity.parentId === parentId).sort((a, b) => a.startedAt - b.startedAt);
    return { current, thread: parent ? { ...parent, steps } : null };
  }, [activities]);
}

export function useLastActivity(): TiboActivity | null {
  const { activities } = useTiboThread();
  return useMemo(
    () =>
      Object.values(activities)
        .filter((activity) => !activity.parentId && activity.status !== "running")
        .reduce<TiboActivity | null>((best, next) => (!best || next.startedAt > best.startedAt ? next : best), null),
    [activities],
  );
}

type Pages = { threads: readonly TiboActivityThread[]; hasMore: boolean };

export function useActivityLog() {
  const { activities, connected } = useTiboThread();
  const [pages, setPages] = useState<Pages | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const loading = useRef(false);

  const load = useCallback(async (before?: number) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const response = await fetch(agentUrl(`${TIBO_ACTIVITY_PATH}${before ? `?before=${before}` : ""}`));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const page = (await response.json()) as Pages;
      setPages((current) =>
        before && current ? { threads: [...current.threads, ...page.threads], hasMore: page.hasMore } : page,
      );
      setStatus("ready");
    } catch {
      setStatus((current) => (current === "ready" ? current : "failed"));
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [connected, load]);

  const threads = useMemo(() => {
    const byId = new Map<string, { thread: TiboActivity; steps: Map<string, TiboActivity> }>();
    for (const thread of pages?.threads ?? []) {
      byId.set(thread.id, { thread, steps: new Map(thread.steps.map((step) => [step.id, step])) });
    }
    const live = Object.values(activities);
    for (const activity of live) {
      if (activity.parentId) continue;
      const known = byId.get(activity.id);
      byId.set(activity.id, { thread: activity, steps: known?.steps ?? new Map() });
    }
    for (const activity of live) {
      if (activity.parentId) byId.get(activity.parentId)?.steps.set(activity.id, activity);
    }
    return [...byId.values()]
      .map(({ thread, steps }) => ({
        ...thread,
        steps: [...steps.values()].sort((a, b) => a.startedAt - b.startedAt),
      }))
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [pages, activities]);

  const loadOlder = useCallback(() => {
    const oldest = pages?.threads.at(-1);
    if (oldest && pages?.hasMore) void load(oldest.startedAt);
  }, [pages, load]);

  const retry = useCallback(() => {
    setStatus("loading");
    void load();
  }, [load]);

  return { threads, status, hasMore: pages?.hasMore ?? false, loadOlder, retry };
}

export function useSentFiles() {
  const { messages, connected } = useTiboThread();
  const [files, setFiles] = useState<readonly TiboSentFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sent = useMemo(
    () => messages.reduce((count, message) => count + (message.attachments?.length ?? 0), 0),
    [messages],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(agentUrl(TIBO_FILES_PATH))
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { files: TiboSentFile[] };
        if (!cancelled) {
          setFiles(body.files);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, sent, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { files, failed, retry };
}
