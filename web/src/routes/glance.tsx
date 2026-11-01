import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/glance` was the app's home before `/now`; old links and bookmarks land there. */
export const Route = createFileRoute("/glance")({
  beforeLoad: () => {
    throw redirect({ to: "/now", replace: true });
  },
});
