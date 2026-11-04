import { type LucideIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
  compact = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 max-md:pr-11">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className={cn("font-semibold", compact ? "text-xl" : "text-title")}>{title}</h1>
        {description && (
          <p className={cn("max-w-prose text-muted-foreground", compact && "text-sm")}>{description}</p>
        )}
      </div>
      {children}
    </header>
  );
}

export function PageEmpty({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("min-h-80 flex-1", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 rounded-xl">
          <Icon className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="flex w-full flex-1 flex-col gap-6 px-3 pt-3 md:px-6 md:pt-4">{children}</main>;
}

export function CreateButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts="N"
      aria-label={label}
      title={`${label} (N)`}
      className="max-md:fixed max-md:right-4 max-md:bottom-[calc(10.25rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:size-12 max-md:rounded-full max-md:shadow-lg max-md:[&_svg:not([class*='size-'])]:size-5"
    >
      <PlusIcon />
      <span className="max-md:hidden">{label}</span>
    </Button>
  );
}
