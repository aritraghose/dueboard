import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A habit's progress as a ring in the color of the nearest `data-tag`
// (the `habit` tag's): one segment per tap up to 12, a smooth arc above
// that. A met target shows a check in the middle; otherwise the taps so far.

const MAX_SEGMENTS = 12;

export function HabitRing({
  done,
  target,
  size = 44,
  className,
}: {
  done: number;
  target: number;
  size?: number;
  className?: string;
}) {
  const stroke = size >= 40 ? 4 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = done >= target;
  const segmented = target > 1 && target <= MAX_SEGMENTS;
  // Gaps between segments, in px along the circle; fewer segments get wider gaps.
  const gap = segmented ? Math.min(6, circumference / target / 3) : 0;
  const segment = circumference / target;
  const center = size / 2;

  return (
    <span
      role="img"
      aria-label={`${done} of ${target}${complete ? ", done" : ""}`}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        {segmented ? (
          Array.from({ length: target }, (_, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(segment - gap, 0.5)} ${circumference}`}
              strokeDashoffset={-(i * segment + gap / 2)}
              className={cn("transition-[stroke] duration-300", i < done ? "stroke-tag" : "stroke-tag/20")}
            />
          ))
        ) : (
          <>
            <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className="stroke-tag/20" />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - Math.min(done / target, 1))}
              className="stroke-tag transition-[stroke-dashoffset] duration-500 ease-out"
            />
          </>
        )}
      </svg>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
        {complete ? (
          <span
            className="grid place-items-center rounded-full bg-tag text-background"
            style={{ width: size - stroke * 4, height: size - stroke * 4 }}
          >
            <CheckIcon className={size >= 40 ? "size-4.5" : "size-3"} strokeWidth={3} />
          </span>
        ) : target > 1 ? (
          <span className={cn("font-semibold text-tag-ink tabular-nums", size >= 40 ? "text-sm" : "text-[0.625rem]")}>
            {done}
          </span>
        ) : null}
      </span>
    </span>
  );
}
