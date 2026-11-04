import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import type {} from "zod/v4/core";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
