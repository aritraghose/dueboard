import { useEffect, useState } from "react";
import { type LocalDate, todayIn } from "@/lib/dates";

/**
 * The current time, updated every `intervalMs`, aligned to the wall clock so
 * a seconds display ticks on the second. `null` during SSR and hydration,
 * since the server's clock and zone aren't the viewer's.
 */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, intervalMs - (current.getTime() % intervalMs));
    };
    tick();
    return () => clearTimeout(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Today in `timeZone`, rechecked every minute so it rolls over at midnight.
 * `null` until mounted (see {@link useNow}).
 */
export function useToday(timeZone: string): LocalDate | null {
  const now = useNow(60_000);
  return now ? todayIn(timeZone, now) : null;
}
