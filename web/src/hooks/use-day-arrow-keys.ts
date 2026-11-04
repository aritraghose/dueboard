import { useEffect } from "react";
import { type LocalDate, addDays } from "@/lib/dates";

const ARROW_KEY_OWNERS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [role="listbox"], [role="slider"], [role="tablist"], [role="radiogroup"]';

export function useDayArrowKeys(date: LocalDate | null, onChange: (date: LocalDate) => void) {
  useEffect(() => {
    if (!date) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      if (event.target instanceof Element && event.target.closest(ARROW_KEY_OWNERS)) return;
      event.preventDefault();
      onChange(addDays(date, event.key === "ArrowLeft" ? -1 : 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [date, onChange]);
}
