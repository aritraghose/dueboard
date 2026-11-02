import type { SessionUser } from "../session.ts";

export type OnboardedUser = SessionUser & { readonly username: string };

// The session the `_app` guard last checked, kept in the browser only. A
// module of its own: the router's code splitter rewrites route files, and a
// module-level variable there doesn't survive it. Sign-out reloads the page,
// which drops it.
let checked: OnboardedUser | undefined;

export const lastCheckedUser = (): OnboardedUser | undefined => checked;

export const rememberCheckedUser = (user: OnboardedUser) => {
  if (typeof window !== "undefined") checked = user;
};
