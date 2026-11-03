import { useId } from "react";
import { cn } from "@/lib/utils";

// Outer, then inner: two of the logo's strokes and their widths, closed into
// rings, and which way each turns.
const RINGS = [
  { r: 15, width: 4.4, color: "var(--tibo-ring-outer)", spin: "animate-tibo-spin" },
  { r: 8.8, width: 3, color: "var(--tibo-ring-inner)", spin: "animate-tibo-spin-reverse" },
] as const;

/**
 * Tibo's avatar: Dueboard's black-and-white logo (`public/logo.svg`) with two
 * of its swooshes closed into rings, on the logo's background circle grown
 * past them, and the logo's bright dot on the inner ring. Drawn inline so it
 * takes the `--tibo*` tokens.
 *
 * Every few seconds the outer ring turns clockwise and the inner one
 * counter-clockwise (the gradients turn with them, and the dot rides the
 * inner one, so the turn shows). Bumping `spin` (a click count, say)
 * restarts the cycle, so they turn at once.
 */
export function TiboMark({ className, spin = 0 }: { className?: string; spin?: number }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-5 shrink-0", className)}>
      <defs>
        {RINGS.map(({ color }, i) => (
          // Lit from the top left, like the logo's strokes.
          <linearGradient key={color} id={`${id}-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${color} 55%, white)` }} />
            <stop offset="0.5" style={{ stopColor: color }} />
            <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${color} 30%, black)` }} />
          </linearGradient>
        ))}
      </defs>
      <circle cx="24" cy="24" r="24" className="fill-tibo-disc" />
      {RINGS.map(({ r, width, spin: animation }, i) => (
        // A new key per `spin` restarts the animation. Each ring turns about
        // the avatar's center (`transform-view` makes that the view box's).
        <g key={`${r}-${spin}`} className={cn("origin-center transform-view", animation)}>
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
