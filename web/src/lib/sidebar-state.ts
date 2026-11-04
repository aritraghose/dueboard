import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

const SIDEBAR_COOKIE = "sidebar_state";

export const readSidebarOpen = createIsomorphicFn()
  .server(() => getCookie(SIDEBAR_COOKIE) === "true")
  .client(() => document.cookie.split("; ").includes(`${SIDEBAR_COOKIE}=true`));
