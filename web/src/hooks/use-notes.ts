import type { CreateNoteInput, Note, NoteDay, UpdateNoteInput } from "@dueboard/api/rpc";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Atom from "effect/reactivity/Atom";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";
import { useRun } from "./use-tasks.ts";

const NOTES = ["notes"];

export const noteListAtom = Atom.family(
  ({ query, pages, limit }: { query: string | undefined; pages: number; limit: number }) =>
    Atom.make((get) =>
      Effect.gen(function* () {
        const days: Array<{ date: LocalDate; notes: Note[] }> = [];
        let cursor: string | undefined;
        for (let page = 0; page < pages; page++) {
          const payload = { limit, ...(query ? { query } : {}), ...(cursor ? { cursor } : {}) };
          const result = yield* get.result(ApiClient.query("ListNotes", payload, { reactivityKeys: NOTES }));
          for (const day of result.days) appendDay(days, day);
          if (!result.nextCursor) return { days, nextCursor: null };
          cursor = result.nextCursor;
        }
        return { days, nextCursor: cursor ?? null };
      }),
    ),
);

const appendDay = (days: Array<{ date: LocalDate; notes: Note[] }>, day: NoteDay) => {
  const last = days.at(-1);
  if (last && last.date === day.date) last.notes.push(...day.notes);
  else days.push({ date: day.date, notes: [...day.notes] });
};

const removedNotesAtom = Atom.make({ ids: new Set<string>() as ReadonlySet<string> }).pipe(Atom.keepAlive);

export function useIsRemoved(): (id: string) => boolean {
  const { ids } = useAtomValue(removedNotesAtom);
  return useCallback((id: string) => ids.has(id), [ids]);
}

export function useNoteActions() {
  const registry = useContext(RegistryContext);
  const run = useRun();
  return useMemo(
    () => ({
      create: (payload: CreateNoteInput) =>
        run(ApiClient.use((client) => client("CreateNote", payload)).pipe(Reactivity.mutation(NOTES))),
      update: (payload: UpdateNoteInput) =>
        run(ApiClient.use((client) => client("UpdateNote", payload)).pipe(Reactivity.mutation(NOTES))),
      remove: async (id: string) => {
        registry.update(removedNotesAtom, ({ ids }) => ({ ids: new Set(ids).add(id) }));
        const exit = await run(
          ApiClient.use((client) => client("DeleteNote", { id })).pipe(Reactivity.mutation(NOTES)),
        );
        if (Exit.isFailure(exit)) {
          registry.update(removedNotesAtom, ({ ids }) => {
            const next = new Set(ids);
            next.delete(id);
            return { ids: next };
          });
        }
        return exit;
      },
      reload: () => run(Reactivity.invalidate(NOTES)),
    }),
    [run, registry],
  );
}

type NotePatch = Omit<UpdateNoteInput, "id">;

export function useOptimisticNotes(notes: readonly Note[]) {
  const { update } = useNoteActions();
  const [patches, setPatches] = useState<ReadonlyMap<string, NotePatch>>(new Map());

  useEffect(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    const agreed = [...patches].filter(([id, patch]) => {
      const note = byId.get(id);
      return note && Object.entries(patch).every(([key, value]) => note[key as keyof Note] === value);
    });
    if (agreed.length === 0) return;
    setPatches((current) => {
      const next = new Map(current);
      for (const [id, patch] of agreed) if (next.get(id) === patch) next.delete(id);
      return next;
    });
  }, [notes, patches]);

  const change = useCallback(
    async (note: Note, patch: NotePatch) => {
      let applied: NotePatch | undefined;
      setPatches((current) => {
        applied = { ...current.get(note.id), ...patch };
        return new Map(current).set(note.id, applied);
      });
      const exit = await update({ id: note.id, ...patch });
      if (Exit.isFailure(exit)) {
        setPatches((current) => {
          if (current.get(note.id) !== applied) return current;
          const next = new Map(current);
          next.delete(note.id);
          return next;
        });
      }
      return exit;
    },
    [update],
  );

  const apply = useCallback(
    (note: Note): Note => {
      const patch = patches.get(note.id);
      return patch ? ({ ...note, ...patch } as Note) : note;
    },
    [patches],
  );

  return { apply, change };
}
