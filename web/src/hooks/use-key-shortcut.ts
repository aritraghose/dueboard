import { useEffect, useRef } from "react";

// Keys typed here are text, or belong to an open dialog or menu.
const KEY_OWNERS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Runs `onPress` when the single key `key` is pressed outside fields and dialogs. */
export function useKeyShortcut(key: string, onPress: () => void) {
  const latest = useRef(onPress);
  latest.current = onPress;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest(KEY_OWNERS)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key]);
}
