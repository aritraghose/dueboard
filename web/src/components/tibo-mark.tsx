import { useId } from "react";
import { cn } from "@/lib/utils";

const RINGS = [
  { r: 15, width: 4.4, color: "var(--tibo-ring-outer)", spin: "animate-tibo-spin" },
  { r: 8.8, width: 3, color: "var(--tibo-ring-inner)", spin: "animate-tibo-spin-reverse" },
] as const;

export function TiboMark({
  className,
  spin = 0,
  idle = true,
}: {
  className?: string;
  spin?: number;
  idle?: boolean;
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-5 shrink-0", className)}>
      <defs>
        {RINGS.map(({ color }, i) => (
          <linearGradient key={color} id={`${id}-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${color} 55%, white)` }} />
            <stop offset="0.5" style={{ stopColor: color }} />
            <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${color} 30%, black)` }} />
          </linearGradient>
        ))}
      </defs>
      <circle cx="24" cy="24" r="24" className="fill-tibo-disc" />
      {RINGS.map(({ r, width, spin: animation }, i) => (
        <g
          key={`${r}-${spin}`}
          className={cn(
            "origin-center transform-view",
            (idle || spin > 0) && animation,
            !idle && "[animation-iteration-count:1]",
          )}
        >
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth={width} stroke={`url(#${id}-${i})`} />
          {i === RINGS.length - 1 && (
            <>
              <circle cx="30.22" cy="17.78" r="1.3" className="fill-tibo-glow" />
              <circle cx="30.22" cy="17.78" r="0.55" className="fill-tibo-disc" />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
