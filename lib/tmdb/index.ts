/**
 * The single place that reads the runtime environment.
 *
 * Fixture mode — explicit, or whenever no API key is configured —
 * serves the static JSON fixtures, which is what lets the app build
 * and prerender without network access.
 */
import type { MediaSource } from "@/lib/media/types";
import { createFixtureSource } from "./fixture";
import { createLiveSource } from "./live";

export interface TmdbEnv {
  TMDB_MODE?: string;
  TMDB_API_KEY?: string;
  VINEXT_KV_CACHE?: KVNamespace;
}

export function getMediaSource(env: TmdbEnv): MediaSource {
  if (env.TMDB_MODE === "fixture" || !env.TMDB_API_KEY) {
    return createFixtureSource();
  }
  return createLiveSource(env.TMDB_API_KEY, { kv: env.VINEXT_KV_CACHE });
}
