import { Link, useRouterState } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { UnreadDot } from "@/components/tibo-panel";
import { useUnseenNotifications } from "@/hooks/use-notifications";
import { unseenLabel } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function NotificationsButton({ className }: { className?: string }) {
  const unseen = useUnseenNotifications();
  const here = useRouterState({ select: (state) => state.location.pathname.startsWith("/notifications") });
  const dot = unseen > 0 && !here;
  return (
    <Link
      to="/notifications"
      aria-label={dot ? `Notifications, ${unseenLabel(unseen)}` : "Notifications"}
      title="Notifications"
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/80 outline-none transition-colors",
        "hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-accent data-[status=active]:text-foreground [&_svg]:size-[1.125rem]",
        className,
      )}
    >
      <BellIcon />
      {dot && <UnreadDot className="absolute top-1 right-1 size-2! ring-[1.5px]!" />}
    </Link>
  );
}
