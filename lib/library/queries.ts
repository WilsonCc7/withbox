import type { MediaKind } from "@/lib/media/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";
import { getDb } from "@/lib/db";
import {
  playbackProgress,
  rating,
  review,
  watchEntry,
  watchlistItem,
} from "@/db/schema";
import type { EpisodeMark, MediaRef, WatchState } from "./types";
import { mediaKey, progressSlot } from "./types";

const EMPTY_WATCH_STATE: WatchState = {
 watched: false,
 watchedAt: null,
 rating: null,
 review: null,
};

/**
 * Reads only. Everything takes `userId` explicitly — the session is
 * resolved in lib/session.ts and by the server actions, never here.
 */

/** Latest watch row for the key (rewatches: newest `watchedAt` wins). */
export async function getWatchState(
 userId: string,
 ref: MediaRef,
): Promise<WatchState> {
 const states = await getWatchStates(userId, [ref]);
 return states.get(mediaKey(ref)) ?? EMPTY_WATCH_STATE;
}

/**
 * One query for N refs, not N queries.
 *
 * A single statement: the requested (kind, tmdbId) pairs become a CTE
 * (UNION ALL of one-row selects — drizzle's way to build a VALUES
 * list), LEFT JOINed against three subqueries scoped to this user and
 * these keys: latest watch time per key (MAX + GROUP BY), rating,
 * review. The database touches only this user's rows for the requested
 * keys.
 *
 * Starting from the requested-keys CTE rather than from watch_entry
 * means a rating or review with no watch row yet (rate-before-watch)
 * is still returned.
 *
 *   WITH requested(kind, tmdbId) AS (
 *     SELECT ? AS "kind", ? AS "tmdbId"
 *     UNION ALL SELECT ?, ?
 *     UNION ALL ...
 *   )
 *   SELECT requested.kind, requested.tmdbId, latest.watchedAt,
 *          rating.value, review.body, review.containsSpoilers
 *   FROM requested
 *   LEFT JOIN (SELECT kind, tmdbId, MAX(watchedAt) AS watchedAt
 *              FROM watch_entry
 *              WHERE userId = ? AND kind IN ? AND tmdbId IN ?
 *              GROUP BY kind, tmdbId) latest
 *     ON latest.kind = requested.kind AND latest.tmdbId = requested.tmdbId
 *   LEFT JOIN rating  ON rating.userId = ? AND rating.kind = requested.kind
 *                     AND rating.tmdbId = requested.tmdbId
 *   LEFT JOIN review  ON review.userId = ? AND review.kind = requested.kind
 *                     AND review.tmdbId = requested.tmdbId
 *
 * `MAX(watchedAt)` is a raw sql fragment, so drizzle's timestamp_ms
 * column mapping does not apply — it arrives as integer milliseconds
 * and is converted to Date below.
 */
export async function getWatchStates(
 userId: string,
 refs: MediaRef[],
): Promise<Map<string, WatchState>> {
 const states = new Map<string, WatchState>(
  refs.map((ref) => [mediaKey(ref), { ...EMPTY_WATCH_STATE }]),
 );
 if (refs.length === 0) return states;

 const db = getDb();
 const kinds = refs.map((ref) => ref.kind);
 const tmdbIds = refs.map((ref) => ref.tmdbId);

 // One-row-per-ref selects unioned into a VALUES-style CTE. Drizzle has no
 // VALUES-list builder, and a unioned query no longer satisfies
 // TypedQueryBuilder (set operators exclude further methods), so the CTE is
 // built from raw SQL with an explicit selection — the typed escape hatch for
 // exactly this.
 //
 // No FROM clause: `SELECT <literal> AS "kind", <literal> AS "tmdbId"` yields
 // exactly one row per ref. An earlier version appended
 // `FROM "watch_entry" WHERE false` (drizzle's idiom for a typed empty select)
 // which is not a no-op once written literally — it emptied the CTE, so the
 // outer join matched nothing and every title silently read as unwatched.
 const requested = db.$with(
  "requested",
  { kind: sql<MediaKind>, tmdbId: sql<number> },
 ).as(
  sql.raw(
   refs
    .map(
     (ref) =>
      `SELECT ${JSON.stringify(ref.kind)} AS "kind", ${ref.tmdbId} AS "tmdbId"`,
    )
    .join(" UNION ALL "),
  ),
 );

 const latestWatch = db
  .select({
   kind: watchEntry.kind,
   tmdbId: watchEntry.tmdbId,
   watchedAt: sql<number>`MAX(${watchEntry.watchedAt})`.as("watchedAt"),
  })
  .from(watchEntry)
  .where(
   and(
    eq(watchEntry.userId, userId),
    inArray(watchEntry.kind, kinds),
    inArray(watchEntry.tmdbId, tmdbIds),
   ),
  )
  .groupBy(watchEntry.kind, watchEntry.tmdbId)
  .as("latest_watch");

 // Column references into the raw-SQL CTE. Selecting
 // `requested.kind`/`requested.tmdbId` as sql fragments
 // keeps them in the projection (drizzle cannot trace
 // columns through raw SQL, so typed CTE fields would
 // be optimised away).
 const requestedKind = sql<MediaKind>`requested.kind`;
 const requestedTmdbId = sql<number>`requested.tmdbId`;

 const rows = await db
  .with(requested)
  .select({
   kind: requestedKind,
   tmdbId: requestedTmdbId,
   watchedAt: latestWatch.watchedAt,
   ratingValue: rating.value,
   reviewBody: review.body,
   containsSpoilers: review.containsSpoilers,
  })
  .from(requested)
  .leftJoin(
   latestWatch,
   and(
    eq(latestWatch.kind, requestedKind),
    eq(latestWatch.tmdbId, requestedTmdbId),
   ),
  )
  .leftJoin(
   rating,
   and(
    eq(rating.userId, userId),
    eq(rating.kind, requestedKind),
    eq(rating.tmdbId, requestedTmdbId),
   ),
  )
  .leftJoin(
   review,
   and(
    eq(review.userId, userId),
    eq(review.kind, requestedKind),
    eq(review.tmdbId, requestedTmdbId),
   ),
  );

 for (const row of rows) {
  const key = mediaKey({
   kind: row.kind as MediaKind,
   tmdbId: row.tmdbId,
  });
  const state = states.get(key);
  if (!state) continue;
  if (row.watchedAt !== null) {
   state.watched = true;
   state.watchedAt = new Date(row.watchedAt);
  }
  if (row.ratingValue !== null) state.rating = row.ratingValue;
  if (row.reviewBody !== null) {
   state.review = {
    body: row.reviewBody,
    containsSpoilers: row.containsSpoilers ?? false,
   };
  }
 }
 return states;
}

export async function getEpisodeMarks(
 userId: string,
 tmdbId: number,
): Promise<EpisodeMark[]> {
 const rows = await getDb()
  .select({ season: watchEntry.season, episode: watchEntry.episode })
  .from(watchEntry)
  .where(
   and(
    eq(watchEntry.userId, userId),
    eq(watchEntry.kind, "tv"),
    eq(watchEntry.tmdbId, tmdbId),
   ),
  );

 // Series-level rows (season/episode null) are show marks, not episode
 // marks. `eq(col, null)` compiles to `= NULL`, which never matches in
 // SQLite, so the null check happens here instead of in SQL.
 const marks: EpisodeMark[] = [];
 for (const row of rows) {
  if (row.season !== null && row.episode !== null) {
   marks.push({ season: row.season, episode: row.episode });
  }
 }
 return marks;
}

export async function getWatchlist(
 userId: string,
 options: { limit?: number; offset?: number } = {},
): Promise<{ refs: MediaRef[]; hasMore: boolean }> {
 const limit = options.limit ?? 60;
 const rows = await getDb()
  .select({ kind: watchlistItem.kind, tmdbId: watchlistItem.tmdbId })
  .from(watchlistItem)
  .where(eq(watchlistItem.userId, userId))
  // `addedAt` alone is not a total order — a bulk add writes many rows in the
  // same millisecond — so the id breaks ties and keeps paging stable.
  .orderBy(desc(watchlistItem.addedAt), desc(watchlistItem.id))
  .limit(limit + 1)
  .offset(options.offset ?? 0);
 // The extra row proves a further page exists; it is not returned.
 return {
  refs: rows
   .slice(0, limit)
   .map((row) => ({ kind: row.kind, tmdbId: row.tmdbId })),
  hasMore: rows.length > limit,
 };
}

export async function getWatched(
 userId: string,
 options: { limit?: number; offset?: number } = {},
): Promise<{
 rows: { ref: MediaRef; watchedAt: Date }[];
 hasMore: boolean;
}> {
 const limit = options.limit ?? 60;
 // Latest watch row per (kind, tmdbId) — one row per film/series, at
 // its most recent watch time. Exact: GROUP BY dedups server-side, so
 // the limit applies to distinct titles, not to raw rows.
 // `MAX(watchedAt)` is a raw fragment: integer ms, converted below.
 // Note this default is what bounds the page: callers that resolve every
 // returned ref through the media source would otherwise fan out unbounded.
 const rows = await getDb()
  .select({
   kind: watchEntry.kind,
   tmdbId: watchEntry.tmdbId,
   watchedAt: sql<number>`MAX(${watchEntry.watchedAt})`.as("watchedAt"),
  })
  .from(watchEntry)
  .where(eq(watchEntry.userId, userId))
  .groupBy(watchEntry.kind, watchEntry.tmdbId)
  // Two titles watched in the same millisecond would otherwise be ordered
  // arbitrarily, and an offset window could repeat or skip one.
  .orderBy(
   desc(sql`MAX(${watchEntry.watchedAt})`),
   desc(watchEntry.kind),
   desc(watchEntry.tmdbId),
  )
  .limit(limit + 1)
  .offset(options.offset ?? 0);

 return {
  rows: rows.slice(0, limit).map((row) => ({
   ref: { kind: row.kind, tmdbId: row.tmdbId },
   watchedAt: new Date(row.watchedAt),
  })),
  hasMore: rows.length > limit,
 };
}

export async function isInWatchlist(
 userId: string,
 ref: MediaRef,
): Promise<boolean> {
 const rows = await getDb()
  .select({ id: watchlistItem.id })
  .from(watchlistItem)
  .where(
   and(
    eq(watchlistItem.userId, userId),
    eq(watchlistItem.kind, ref.kind),
    eq(watchlistItem.tmdbId, ref.tmdbId),
   ),
  )
  .limit(1);
 return rows.length > 0;
}

/**
 * Latest stored playback position for one slot (a film, or one
 * episode), or null when nothing is stored yet.
 */
export async function getProgress(
  userId: string,
  ref: MediaRef,
  season?: number,
  episode?: number,
): Promise<{ positionSeconds: number; durationSeconds: number | null } | null> {
  const rows = await getDb()
    .select({
      positionSeconds: playbackProgress.positionSeconds,
      durationSeconds: playbackProgress.durationSeconds,
    })
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, userId),
        eq(
          playbackProgress.slotKey,
          progressSlot(ref.kind, ref.tmdbId, season ?? null, episode ?? null),
        ),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
