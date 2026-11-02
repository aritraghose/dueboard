import { cn } from "@/lib/utils";

/**
 * Tibo's face: a marigold blob with two eyes and a lopsided grin. Drawn
 * inline (no image asset) so it takes the theme's colors.
 */
export function TiboMark({ className, blink = true }: { className?: string; blink?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-5 shrink-0", className)}>
      <path
        d="M12 2.5c5.4 0 9.5 3.6 9.5 9.2 0 5.9-4.3 9.8-9.6 9.8-5.6 0-9.4-4-9.4-9.6C2.5 6.3 6.6 2.5 12 2.5Z"
        className="fill-tibo"
      />
      <g className={cn("origin-[12px_10.5px] fill-tibo-foreground", blink && "animate-tibo-blink")}>
        <ellipse cx="8.6" cy="10.5" rx="1.35" ry="1.7" />
        <ellipse cx="15.2" cy="10" rx="1.35" ry="1.9" />
      </g>
      <path
        d="M8.4 15.1c1.6 1.5 4.6 1.7 7.3-.4"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="stroke-tibo-foreground"
      />
    </svg>
  );
}
