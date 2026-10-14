import type { MediaKind } from "@/lib/media/types";

/**
 * Identifies one film or one series. Season/episode are NOT part of the
 * ref — they live on individual `watch_entry` rows (see db/schema.ts
 * modelling notes: no series-level row).
 */
export interface MediaRef {
  kind: MediaKind;
  tmdbId: number;
}

/**
 * Everything the UI shows about a user's relationship to one film or
 * series. `watched` is an EXISTS over `watch_entry`; rewatches are
 * representable but collapse to `true` here.
 */
export interface WatchState {
  watched: boolean;
  watchedAt: Date | null;
  /** Half-stars, 1..10 (7 = three and a half stars). */
  rating: number | null;
  review: { body: string; containsSpoilers: boolean } | null;
}

/** One watched episode, as a `(season, episode)` pair. */
export interface EpisodeMark {
  season: number;
  episode: number;
}

/** Stable cache/form key for a MediaRef: `${kind}:${tmdbId}`. */
export function mediaKey(ref: MediaRef): string {
  return `${ref.kind}:${ref.tmdbId}`;
}
