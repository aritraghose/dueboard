import type { Tag } from "@dueboard/api/rpc";
import { CheckIcon, ChevronDownIcon, TagIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Filters a list by tag: pick one or several (a task shows when it has any
 * of them), or "Any tag" to clear. The list stays open while picking.
 */
export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: readonly Tag[] | undefined;
  /** The picked tag ids; empty means any tag. */
  value: readonly string[];
  onChange: (ids: readonly string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = (tags ?? []).filter((tag) => value.includes(tag.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((other) => other !== id) : [...value, id]);
  const only = picked.length === 1 ? picked[0] : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={picked.length > 0 ? "secondary" : "ghost"}
          size="sm"
          data-tag={only?.color}
          aria-label={picked.length > 0 ? `Filtered by ${picked.map((tag) => tag.name).join(", ")}. Change tags` : "Filter by tag"}
        >
          {picked.length === 0 ? (
            <TagIcon />
          ) : (
            <span aria-hidden="true" className="flex -space-x-1">
              {picked.slice(0, 3).map((tag) => (
                <span key={tag.id} data-tag={tag.color} className="size-2.5 rounded-full bg-tag ring-2 ring-secondary" />
              ))}
            </span>
          )}
          {picked.length === 0 ? "Any tag" : only ? only.name : `${picked.length} tags`}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56! gap-0! p-1.5!">
        <ul aria-label="Filter by tag" className="flex max-h-64 flex-col overflow-y-auto">
          <li>
            <button
              type="button"
              aria-pressed={value.length === 0}
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent aria-pressed:font-medium"
            >
              <span className="flex-1">Any tag</span>
              {value.length === 0 && <CheckIcon aria-hidden="true" className="size-4 text-primary" />}
            </button>
          </li>
          {(tags ?? []).map((tag) => {
            const on = value.includes(tag.id);
            return (
              <li key={tag.id}>
                <button
                  type="button"
                  data-tag={tag.color}
                  aria-pressed={on}
                  onClick={() => toggle(tag.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent",
                    on && "font-medium",
                  )}
                >
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-tag" />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {on && <CheckIcon aria-hidden="true" className="size-4 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
