import { cn } from "@/lib/utils";

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
