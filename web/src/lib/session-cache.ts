import type { SessionUser } from "../session.ts";

export type OnboardedUser = SessionUser & { readonly username: string };

let checked: OnboardedUser | undefined;

export const lastCheckedUser = (): OnboardedUser | undefined => checked;

export const rememberCheckedUser = (user: OnboardedUser) => {
  if (typeof window !== "undefined") checked = user;
};
