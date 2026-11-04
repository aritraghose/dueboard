import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/glance")({
  beforeLoad: () => {
    throw redirect({ to: "/now", replace: true });
  },
});
