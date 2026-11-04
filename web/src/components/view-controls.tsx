import { ArrowDownIcon, ArrowDownUpIcon, ArrowUpIcon, LayersIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Segmented } from "@/components/task-fields";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ViewOptions } from "@/hooks/use-view-options";
import { cn } from "@/lib/utils";

const SHOW_LABEL: Record<ViewOptions["show"], string> = {
  all: "All",
  tasks: "Tasks",
  habits: "Habits",
  goals: "Goals",
};
const SORT_LABEL: Record<ViewOptions["sort"], string> = {
  default: "Default order",
  importance: "Importance",
  minutes: "Expected time",
};
const DIRECTION_HINT: Record<Exclude<ViewOptions["sort"], "default">, Record<ViewOptions["direction"], string>> = {
  importance: { asc: "Least important first", desc: "Most important first" },
  minutes: { asc: "Shortest first", desc: "Longest first" },
};
const FIRST_DIRECTION: Record<Exclude<ViewOptions["sort"], "default">, ViewOptions["direction"]> = {
  importance: "desc",
  minutes: "asc",
};

export function ViewControls({
  view,
  onChange,
  kinds = false,
  filter,
  groups,
  extra,
  className,
}: {
  view: ViewOptions;
  onChange: (patch: Partial<ViewOptions>) => void;
  kinds?: boolean;
  filter?: ReactNode;
  groups: readonly { readonly value: ViewOptions["group"]; readonly label: string }[];
  extra?: ReactNode;
  className?: string;
}) {
  const sorted = view.sort !== "default";
  const hint = sorted ? DIRECTION_HINT[view.sort as Exclude<ViewOptions["sort"], "default">][view.direction] : "";
  const group = groups.find((option) => option.value === view.group) ?? groups[0];

  return (
    <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-2", className)}>
      {kinds && (
        <Segmented
          label="Show"
          value={view.show}
          options={(["all", "tasks", "habits", "goals"] as const).map((value) => ({ value, label: SHOW_LABEL[value] }))}
          onChange={(show) => onChange({ show })}
        />
      )}
      {filter}

      <div className="flex items-center gap-0.5 max-sm:-ml-2.5 sm:ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={cn(sorted && "text-foreground")}>
              <ArrowDownUpIcon />
              {sorted ? SORT_LABEL[view.sort] : "Sort"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={view.sort}
              onValueChange={(value) => {
                const sort = value as ViewOptions["sort"];
                onChange(sort === "default" ? { sort } : { sort, direction: FIRST_DIRECTION[sort] });
              }}
            >
              {(["default", "importance", "minutes"] as const).map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {SORT_LABEL[value]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {sorted && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={hint}
            aria-label={`${hint}. Reverse the order`}
            onClick={() => onChange({ direction: view.direction === "asc" ? "desc" : "asc" })}
          >
            {view.direction === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </Button>
        )}

        {groups.length > 1 && group && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <LayersIcon />
                {group === groups[0] ? "Group" : group.value === "none" ? "Ungrouped" : `By ${group.label.toLowerCase()}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>Group</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={group.value}
                onValueChange={(value) => onChange({ group: value as ViewOptions["group"] })}
              >
                {groups.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {extra}
      </div>
    </div>
  );
}
