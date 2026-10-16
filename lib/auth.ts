import { betterAuth } from "better-auth";
import { env } from "./env";

/**
 * The authenticated user, as far as this app cares.
 */
export interface AuthUser {
 id: string;
 email: string;
 name?: string | null;
}

export interface AuthSession {
 user: AuthUser;
}

/**
 * The slice of the Better Auth instance this app uses.
 *
 * Declared by hand rather than derived, so consumers import a stable name and
 * the app does not couple to Better Auth's generic parameter shape.
 */
export interface AuthInstance {
 handler(request: Request): Promise<Response>;
 api: {
  getSession(input: { headers: Headers }): Promise<AuthSession | null>;
 };
}

let cached: AuthInstance | undefined;

/**
 * The Better Auth instance, built on first use and reused for the isolate's
 * lifetime.
 *
 * Bindings are read inside this function, never at module scope. A Worker's
 * `process.env` is only populated once a request is in flight, so a
 * module-scope `const { DB } = env()` captures `undefined` in whichever bundle
 * initialises early — which surfaced as
 * `TypeError: Cannot read properties of undefined (reading 'prepare')` on
 * signed-in page renders, while the auth route handler worked fine.
 *
 * `database` accepts a raw D1 binding: Better Auth's kysely adapter detects
 * `"prepare" in db && "batch" in db && "exec" in db` and uses its built-in
 * `D1SqliteDialect` (with `transaction: false`, since D1 has no interactive
 * transactions — it uses `batch()` instead).
 *
 * The D1 tables this expects are in `db/schema.ts`; the initial migration lives
 * in `drizzle/`.
 */
export function getAuth(): AuthInstance {
 if (!cached) {
  const { DB, BETTER_AUTH_URL, BETTER_AUTH_SECRET } = env();
  cached = betterAuth({
   baseURL: BETTER_AUTH_URL,
   secret: BETTER_AUTH_SECRET,
   emailAndPassword: { enabled: true },
   database: DB,
   // Columns Better Auth does not know about must be declared, or its
   // adapter drops them. `bio` also exists in `db/schema.ts`.
   user: {
    additionalFields: {
     bio: { type: "string", required: false },
    },
   },
  });
 }
 return cached;
}
