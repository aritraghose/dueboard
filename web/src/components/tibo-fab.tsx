import { useEffect, useRef, useState, type PointerEvent } from "react";
import { TiboMark } from "@/components/tibo-mark";
import { UnreadDot } from "@/components/tibo-panel";
import { useTopBarSlots } from "@/components/top-bar";
import { useTibo, useTiboThread } from "@/hooks/use-tibo";
import { cn } from "@/lib/utils";

const POSITION_KEY = "dueboard-tibo-fab";
const DRAG_THRESHOLD_PX = 6;
const EDGE_PX = 8;

type Position = { right: number; bottom: number };

function readPosition(): Position | null {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as Position | null;
    return saved && typeof saved.right === "number" && typeof saved.bottom === "number" ? saved : null;
  } catch {
    return null;
  }
}

export function TiboFab({ className }: { className?: string }) {
  const { setOpen } = useTibo();
  const { unread } = useTiboThread();
  const slots = useTopBarSlots();
  const [position, setPosition] = useState<Position | null>(null);
  const [spins, setSpins] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; from: Position; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  useEffect(() => setPosition(readPosition()), []);

  if (slots?.tibo === false) return null;

  const clamp = (next: Position): Position => {
    const size = button.current?.offsetWidth ?? 48;
    return {
      right: Math.min(Math.max(next.right, EDGE_PX), window.innerWidth - size - EDGE_PX),
      bottom: Math.min(Math.max(next.bottom, EDGE_PX), window.innerHeight - size - EDGE_PX),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      from: { right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    current.moved = true;
    setPosition(clamp({ right: current.from.right - dx, bottom: current.from.bottom - dy }));
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    justDragged.current = true;
    setPosition((settled) => {
      if (settled) {
        try {
          localStorage.setItem(POSITION_KEY, JSON.stringify(settled));
        } catch {
        }
      }
      return settled;
    });
  };

  return (
    <button
      ref={button}
      type="button"
      aria-label={unread ? "Open Tibo, new message" : "Open Tibo"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onClick={() => {
        if (justDragged.current) {
          justDragged.current = false;
          return;
        }
        setSpins((n) => n + 1);
        setOpen(true);
      }}
      style={position ? { right: position.right, bottom: position.bottom } : undefined}
      className={cn(
        "fixed z-40 grid size-12 touch-none place-items-center rounded-full shadow-lg outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/60",
        !position && "right-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <TiboMark spin={spins} className="size-12" />
      {unread && <UnreadDot className="absolute top-0.5 right-0.5" />}
    </button>
  );
}
