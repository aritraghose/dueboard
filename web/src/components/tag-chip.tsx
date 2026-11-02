import type { TagColor } from "@dueboard/api/rpc";
import { cn } from "@/lib/utils";

/** A tag's name on its palette color (`data-tag` in styles.css). */
export function TagChip({
  name,
  color,
  className,
}: {
  name: string;
  color: TagColor;
  className?: string;
}) {
  return (
    <span
      data-tag={color}
      className={cn(
        "inline-flex h-5 max-w-40 items-center gap-1.5 rounded-full bg-tag-soft px-2 text-xs font-medium text-tag-ink",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-tag" />
      <span className="truncate">{name}</span>
    </span>
  );
}
