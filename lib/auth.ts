import { betterAuth } from "better-auth";
import { env } from "./env";

/**
 * Better Auth instance backed by the Worker's D1 binding.
 *
 * `database` accepts a raw D1 binding: Better Auth's kysely adapter detects
 * `"prepare" in db && "batch" in db && "exec" in db` and uses its built-in
 * `D1SqliteDialect` (with `transaction: false`, since D1 has no interactive
 * transactions — it uses `batch()` instead). No `@better-auth/drizzle-adapter`
 * import is needed.
 *
 * `secret` comes from the Worker binding, never `process.env` directly — on
 * Workers, only declared bindings are visible.
 *
 * The D1 tables this expects are in `db/schema.ts`; the initial migration
 * lives in `drizzle/`.
 */
const { DB, BETTER_AUTH_URL, BETTER_AUTH_SECRET } = env();

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  database: DB,
});

export type Auth = typeof auth;
