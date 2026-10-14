import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { env } from "./env";
import * as schema from "../db/schema";

export type Db = DrizzleD1Database<typeof schema> & {
  $client: D1Database;
};

// Workers reuse isolates across requests, so the D1 binding is stable
// per-isolate. The client is built once per isolate, lazily, on first
// use — never at module scope, because the binding is only injected
// when the isolate serves a request (and `pnpm exec tsc --noEmit`
// runs outside the Worker runtime, where `env().DB` is undefined).
let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    db = drizzle(env().DB, { schema }) as Db;
  }
  return db;
}
