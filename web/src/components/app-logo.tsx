import { cn } from "@/lib/utils";

/**
 * Dueboard's logo: three gray swooshes ending in a bright dot
 * (`public/logo.svg`, also the favicon). Tibo's avatar is two of its
 * strokes closed into rings (`tibo-mark.tsx`). Decorative, since it
 * always sits next to the "Dueboard" wordmark or a page title.
 */
export function AppLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("size-6 shrink-0 select-none", className)}
    />
  );
}
