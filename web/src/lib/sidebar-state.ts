import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** The cookie `components/ui/sidebar.tsx` writes when the sidebar opens or closes. */
const SIDEBAR_COOKIE = "sidebar_state";

/**
 * Whether the user left the sidebar expanded. Read from the cookie on the
 * server too, so the first paint already has the right width. Collapsed
 * (the icon rail) unless they opened it.
 */
export const readSidebarOpen = createIsomorphicFn()
  .server(() => getCookie(SIDEBAR_COOKIE) === "true")
  .client(() => document.cookie.split("; ").includes(`${SIDEBAR_COOKIE}=true`));
