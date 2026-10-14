import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client.
 *
 * Sign-in and sign-up post to `/api/auth/[...all]`, which works in the
 * production build. `vite dev` cannot serve those routes in this project (see
 * the limitations section in `.omp/AGENTS.md`), so test auth with
 * `pnpm run build && pnpm run start`.
 */
export const authClient = createAuthClient();
