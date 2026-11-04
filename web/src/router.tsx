import { createRouter } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "./components/default-catch-boundary.tsx";
import { NotFound } from "./components/not-found.tsx";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
