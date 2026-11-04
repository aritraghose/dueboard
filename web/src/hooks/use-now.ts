import { useEffect, useState } from "react";
import { type LocalDate, todayIn } from "@/lib/dates";

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

export function useToday(timeZone: string): LocalDate | null {
  const now = useNow(60_000);
  return now ? todayIn(timeZone, now) : null;
}
