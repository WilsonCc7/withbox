import { env as workerEnv } from "cloudflare:workers";

/**
 * Worker bindings and variables.
 *
 * Read from `cloudflare:workers`, not `process.env`. In this vinext setup the
 * route-handler bundle has `process.env` populated but the React Server
 * Component render path does not — a server component reading `process.env.DB`
 * gets `undefined` and queries fail deep inside the SQL client with
 * `Cannot read properties of undefined (reading 'prepare')`. The
 * `cloudflare:workers` binding is populated in both.
 *
 * A Worker only sees what `cloudflare.config.ts` declares as a binding, so
 * adding a variable means declaring it there first.
 *
 * `process.env` remains as the fallback for contexts without the Workers
 * runtime (tests, scripts).
 */
export interface Env {
 DB: D1Database;
 BETTER_AUTH_SECRET?: string;
 BETTER_AUTH_URL?: string;
 TMDB_MODE?: string;
 TMDB_API_KEY?: string;
 /** Response cache for TMDB/OMDb. Optional: scripts and tests have none. */
 VINEXT_KV_CACHE?: KVNamespace;
 /** Avatar bucket. Optional for the same reason. */
 AVATARS?: R2Bucket;
 /** OMDb key for IMDb/Rotten Tomatoes scores. Absent => TMDB fallback only. */
 OMDB_API_KEY?: string;
}

export function env(): Env {
 return (workerEnv ?? process.env) as unknown as Env;
}
