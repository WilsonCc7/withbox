/**
 * IMDb / Rotten Tomatoes scores via OMDb.
 *
 * Two cache levels, checked outermost first:
 *  - `omdb:scores:{kind}:{tmdbId}` — the title-keyed scores. This is the entry
 *    a grid hits: one KV read and no TMDB round trip. Written whenever a
 *    title's scores are resolved (including an OMDb `Response: False` miss).
 *  - `omdb:ids:{kind}:{tmdbId}` (30d) then `omdb:scores:{imdbId}` (7d) — the
 *    original two-hop path, which serves the fast path's miss and keeps the
 *    entries written before the fast path existed working.
 *
 * Every failure — missing key, no IMDb id, network error, timeout — degrades
 * to `{ imdb: null, rt: null }` so callers fall back to the TMDB score.
 * Nothing from this module throws.
 *
 * An offline media source (`source.offline`) short-circuits to `NONE` before
 * any cache read: this module is the one place that reaches an upstream using
 * an id obtained from another one, so it is the one place a cached id could
 * turn an offline build into a networked one.
 */
import { env } from "@/lib/env";
import { mediaKey } from "@/lib/library/types";
import type { MediaKind, MediaSource } from "@/lib/media/types";
import { acquire } from "@/lib/rate-limit";
import { cachedJson } from "@/lib/tmdb/cache";

export interface MediaRatings {
 imdb: number | null;
 rt: number | null;
}

interface OmdbResponse {
 Response?: string;
 imdbRating?: string;
 Ratings?: { Source?: string; Value?: string }[];
}

const NONE: MediaRatings = { imdb: null, rt: null };

const ID_TTL = 2592000; // 30d: a title's IMDb id does not move.
const SCORE_TTL = 604800; // 7d
const MISS_TTL = 3600; // a temporarily-absent title retries within the day.

/** OMDb reports "N/A" for anything it lacks; `NaN`/0 have no meaning here. */
function parseScore(raw: string | undefined): number | null {
 if (!raw || raw === "N/A") return null;
 return Number(raw.replace("%", "")) || null;
}

export async function getRatings(
 source: MediaSource,
 ref: { kind: MediaKind; tmdbId: number },
): Promise<MediaRatings> {
 // An offline source has no upstream ids, and it must not reach one through the
 // cache either: `omdb:ids:*` entries outlive a build (30d) and are shared with
 // live runs, so a title cached during a live session used to hand this module
 // an IMDb id and turn a fixture build into a networked one. The visible
 // symptom was a page that rendered IMDb chips on one load and the TMDB chip on
 // the next, because a failed OMDb call is never cached.
 if (source.offline) return NONE;

 const { OMDB_API_KEY: apiKey, VINEXT_KV_CACHE: kv } = env();
 if (!apiKey || !kv) return NONE;

 try {
  // Fast path: one read, no TMDB `external_ids` call. This is the entry a
  // grid hits once any page has resolved the title's scores.
  const titleKey = `omdb:scores:${ref.kind}:${ref.tmdbId}`;
  const titleCached = await kv.get(titleKey, "json");
  if (titleCached !== null && titleCached !== undefined) {
   return titleCached as MediaRatings;
  }

  const imdbId = await cachedJson<string | null>(
   kv,
   `omdb:ids:${ref.kind}:${ref.tmdbId}`,
   ID_TTL,
   async () => (await source.externalIds(ref.kind, ref.tmdbId)).imdbId,
  );
  if (!imdbId) return NONE;

  const scoreKey = `omdb:scores:${imdbId}`;
  const cached = await kv.get(scoreKey, "json");
  if (cached !== null && cached !== undefined) return cached as MediaRatings;

  // 20/s keeps a cold grid (~40 titles) under a couple of seconds while
  // staying orders of magnitude below OMDb's daily cap.
  await acquire("www.omdbapi.com", 20);
  const response = await fetch(
   `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}`,
   { signal: AbortSignal.timeout(2500) },
  );
  if (!response.ok) return NONE;

  const wire = (await response.json()) as OmdbResponse;
  const miss = wire.Response === "False";
  const scores: MediaRatings = miss
   ? NONE
   : {
    imdb: parseScore(wire.imdbRating),
    rt: parseScore(
     (wire.Ratings ?? []).find(
      (rating) => rating.Source === "Rotten Tomatoes",
     )?.Value,
    ),
   };

  try {
   // Both keys, same payload: the imdb-keyed entry is shared by titles that
   // point at the same IMDb id, the title-keyed one is what a grid hits.
   const expirationTtl = miss ? MISS_TTL : SCORE_TTL;
   await Promise.all([
    kv.put(scoreKey, JSON.stringify(scores), { expirationTtl }),
    kv.put(titleKey, JSON.stringify(scores), { expirationTtl }),
   ]);
  } catch {
   // A cache write failing must not fail the request.
  }
  return scores;
 } catch {
  return NONE;
 }
}

export async function getRatingsBatch(
 source: MediaSource,
 refs: { kind: MediaKind; tmdbId: number }[],
): Promise<Map<string, MediaRatings>> {
 const entries = await Promise.all(
  refs.map(
   async (ref) =>
    [mediaKey(ref), await getRatings(source, ref)] as const,
  ),
 );
 return new Map(entries);
}
