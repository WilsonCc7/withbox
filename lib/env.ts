/**
 * Worker bindings and variables.
 *
 * A Worker only sees what `cloudflare.config.ts` declares as a binding — the
 * host shell environment and `.dev.vars` never reach `process.env` on their own.
 * Adding a variable means declaring it there first.
 */
export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  TMDB_MODE?: string;
  TMDB_API_KEY?: string;
}

export function env(): Env {
  return process.env as unknown as Env;
}
