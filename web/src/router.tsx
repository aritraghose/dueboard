import { createRouter } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "./components/default-catch-boundary.tsx";
import { NotFound } from "./components/not-found.tsx";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // Routes without their own error or not-found screen use these.
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
