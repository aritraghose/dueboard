import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
// Lets `tsc` name the zod types inside Better Auth's client signatures
// (TS2883 otherwise).
import type {} from "zod/v4/core";

/**
 * Browser client for Better Auth. It calls the same-origin `/api/auth/*`
 * proxy (`./routes/api/auth/$.ts`), so it needs no base URL.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
