import type { MediaKind } from "@/lib/media/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
 favorite,
 mediaLike,
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
 * Every multi-ref lookup is chunked.
 *
 * Two runtime limits force it: D1 caps bound parameters at 100 per statement,
 * and the SQLite in the local runtime caps a compound SELECT at five terms —
 * so expanding N refs into a VALUES-style CTE (the obvious way to ask for the
 * state of "these titles") fails as soon as a page grids more than five
 * posters. Chunking keeps every statement small. Because each row carries its
 * own kind/tmdbId, a coarse `IN` filter can only over-read rows the caller then
 * ignores by key.
 */
export const REF_CHUNK = 60;

/** Generic so any keyed list (refs, ids) can be chunked the same way. */
export function chunkRefs<T>(refs: T[]): T[][] {
 const chunks: T[][] = [];
 for (let i = 0; i < refs.length; i += REF_CHUNK) {
  chunks.push(refs.slice(i, i + REF_CHUNK));
 }
 return chunks;
}

/** `IN` values for one chunk: kinds collapse to the one or two present. */
function refFilter(chunk: MediaRef[]): { kinds: MediaKind[]; tmdbIds: number[] } {
 return {
  kinds: [...new Set(chunk.map((ref) => ref.kind))],
  tmdbIds: chunk.map((ref) => ref.tmdbId),
 };
}

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
 * Watch state for N refs, in a bounded number of statements.
 *
 * Three lookups, each chunked over the ref list: the newest watch row per key
 * (MAX + GROUP BY), the user's rating, the user's review. They stay separate
 * statements rather than one join because a title can be rated before it is
 * watched — a join driven from `watch_entry` drops that case, and one driven
 * from a requested-keys CTE cannot be expressed within the runtime's
 * compound-SELECT limit (see `REF_CHUNK`).
 *
 * `MAX(watchedAt)` is a raw sql fragment, so drizzle's timestamp_ms column
 * mapping does not apply — it arrives as integer milliseconds and is converted
 * to Date below.
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
 const chunks = chunkRefs(refs);

 const [watchPages, ratingPages, reviewPages] = await Promise.all([
  Promise.all(
   chunks.map((chunk) => {
    const { kinds, tmdbIds } = refFilter(chunk);
    return db
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
     .groupBy(watchEntry.kind, watchEntry.tmdbId);
   }),
  ),
  Promise.all(
   chunks.map((chunk) => {
    const { kinds, tmdbIds } = refFilter(chunk);
    return db
     .select({
      kind: rating.kind,
      tmdbId: rating.tmdbId,
      value: rating.value,
     })
     .from(rating)
     .where(
      and(
       eq(rating.userId, userId),
       inArray(rating.kind, kinds),
       inArray(rating.tmdbId, tmdbIds),
      ),
     );
   }),
  ),
  Promise.all(
   chunks.map((chunk) => {
    const { kinds, tmdbIds } = refFilter(chunk);
    return db
     .select({
      kind: review.kind,
      tmdbId: review.tmdbId,
      body: review.body,
      containsSpoilers: review.containsSpoilers,
     })
     .from(review)
     .where(
      and(
       eq(review.userId, userId),
       inArray(review.kind, kinds),
       inArray(review.tmdbId, tmdbIds),
      ),
     );
   }),
  ),
 ]);

 const watchRows = watchPages.flat();
 const ratingRows = ratingPages.flat();
 const reviewRows = reviewPages.flat();

 for (const row of watchRows) {
  const state = states.get(mediaKey({ kind: row.kind, tmdbId: row.tmdbId }));
  if (!state) continue;
  // The coarse `IN` filter can match another user's row only for a key that
  // was requested, and every requested key is already in the map.
  state.watched = true;
  state.watchedAt = new Date(row.watchedAt);
 }

 for (const row of ratingRows) {
  const state = states.get(mediaKey({ kind: row.kind, tmdbId: row.tmdbId }));
  if (state) state.rating = row.value;
 }

 for (const row of reviewRows) {
  const state = states.get(mediaKey({ kind: row.kind, tmdbId: row.tmdbId }));
  if (state) {
   state.review = { body: row.body, containsSpoilers: row.containsSpoilers };
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
 options: { limit?: number; offset?: number; kind?: MediaKind } = {},
): Promise<{ refs: MediaRef[]; hasMore: boolean }> {
 const limit = options.limit ?? 60;
 const rows = await getDb()
  .select({ kind: watchlistItem.kind, tmdbId: watchlistItem.tmdbId })
  .from(watchlistItem)
  .where(
   options.kind
    ? and(eq(watchlistItem.userId, userId), eq(watchlistItem.kind, options.kind))
    : eq(watchlistItem.userId, userId),
  )
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
 options: {
  limit?: number;
  offset?: number;
  kind?: MediaKind;
  sort?: "recent" | "rating";
 } = {},
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
 const userFilter = options.kind
  ? and(eq(watchEntry.userId, userId), eq(watchEntry.kind, options.kind))
  : eq(watchEntry.userId, userId);
 // `rating` sort LEFT JOINs the user's score for the same key and
 // puts unrated titles last; the recent ordering is byte-identical
 // to the pre-sort default so paging stays stable.
 const rows =
  options.sort === "rating"
   ? await getDb()
    .select({
     kind: watchEntry.kind,
     tmdbId: watchEntry.tmdbId,
     watchedAt: sql<number>`MAX(${watchEntry.watchedAt})`.as("watchedAt"),
    })
    .from(watchEntry)
    .leftJoin(
     rating,
     and(
      eq(rating.userId, watchEntry.userId),
      eq(rating.kind, watchEntry.kind),
      eq(rating.tmdbId, watchEntry.tmdbId),
     ),
    )
    .where(userFilter)
    .groupBy(watchEntry.kind, watchEntry.tmdbId)
    .orderBy(
     sql`${rating.value} IS NULL`,
     desc(rating.value),
     desc(sql`MAX(${watchEntry.watchedAt})`),
     desc(watchEntry.kind),
     desc(watchEntry.tmdbId),
    )
    .limit(limit + 1)
    .offset(options.offset ?? 0)
   : await getDb()
    .select({
     kind: watchEntry.kind,
     tmdbId: watchEntry.tmdbId,
     watchedAt: sql<number>`MAX(${watchEntry.watchedAt})`.as("watchedAt"),
    })
    .from(watchEntry)
    .where(userFilter)
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

export async function getWatchlistKeys(
 userId: string,
 refs: MediaRef[],
): Promise<Set<string>> {
 if (refs.length === 0) return new Set();
 const db = getDb();
 const pages = await Promise.all(
  chunkRefs(refs).map((chunk) => {
   const { kinds, tmdbIds } = refFilter(chunk);
   return db
    .select({ kind: watchlistItem.kind, tmdbId: watchlistItem.tmdbId })
    .from(watchlistItem)
    .where(
     and(
      eq(watchlistItem.userId, userId),
      inArray(watchlistItem.kind, kinds),
      inArray(watchlistItem.tmdbId, tmdbIds),
     ),
    );
  }),
 );
 return new Set(pages.flat().map((row) => mediaKey(row)));
}

/** Watch state plus watchlist membership for a whole grid, chunked. */
export async function getCardStates(
 userId: string,
 refs: MediaRef[],
): Promise<Map<string, { watched: boolean; inWatchlist: boolean }>> {
 const [states, watchlistKeys] = await Promise.all([
  getWatchStates(userId, refs),
  getWatchlistKeys(userId, refs),
 ]);
 const cardStates = new Map<
  string,
  { watched: boolean; inWatchlist: boolean }
 >();
 for (const ref of refs) {
  const key = mediaKey(ref);
  cardStates.set(key, {
   watched: states.get(key)?.watched ?? false,
   inWatchlist: watchlistKeys.has(key),
  });
 }
 return cardStates;
}

export interface DiaryEntry {
 id: string;
 kind: MediaKind;
 tmdbId: number;
 season: number | null;
 episode: number | null;
 watchedAt: Date;
 rewatch: boolean;
}

/**
 * The diary: raw `watch_entry` rows, newest first. `year`/`month`
 * filter via `strftime` on `watchedAt / 1000` — the column is
 * stored as integer milliseconds, and `strftime` takes unix
 * seconds.
 */
export async function getDiary(
 userId: string,
 opts: {
  limit: number;
  offset: number;
  year?: number | null;
  month?: number | null;
 },
): Promise<{ items: DiaryEntry[]; hasMore: boolean }> {
 const predicates = [eq(watchEntry.userId, userId)];
 if (opts.year != null) {
  predicates.push(
   sql`strftime('%Y', ${watchEntry.watchedAt} / 1000, 'unixepoch') = ${String(opts.year)}`,
  );
 }
 if (opts.month != null) {
  predicates.push(
   sql`strftime('%m', ${watchEntry.watchedAt} / 1000, 'unixepoch') = ${String(opts.month).padStart(2, "0")}`,
  );
 }

 const rows = await getDb()
  .select({
   id: watchEntry.id,
   kind: watchEntry.kind,
   tmdbId: watchEntry.tmdbId,
   season: watchEntry.season,
   episode: watchEntry.episode,
   watchedAt: watchEntry.watchedAt,
   rewatch: watchEntry.rewatch,
  })
  .from(watchEntry)
  .where(and(...predicates))
  // `id` breaks ties for rows logged in the same millisecond,
  // keeping the page order stable.
  .orderBy(desc(watchEntry.watchedAt), desc(watchEntry.id))
  .limit(opts.limit + 1)
  .offset(opts.offset);

 return {
  items: rows.slice(0, opts.limit).map((row) => ({
   id: row.id,
   kind: row.kind,
   tmdbId: row.tmdbId,
   season: row.season,
   episode: row.episode,
   watchedAt: row.watchedAt,
   rewatch: row.rewatch,
  })),
  hasMore: rows.length > opts.limit,
 };
}

/** Distinct diary years, newest first — one statement. */
export async function getDiaryYears(userId: string): Promise<number[]> {
 // The expression is repeated in ORDER BY rather than named by alias: drizzle
 // emits this projection without an alias, and SQLite then reads a bare `year`
 // as a column of watch_entry ("no such column: year").
 const year = sql<number>`strftime('%Y', ${watchEntry.watchedAt} / 1000, 'unixepoch')`;
 const rows = await getDb()
  .selectDistinct({ year })
  .from(watchEntry)
  .where(eq(watchEntry.userId, userId))
  .orderBy(desc(year));
 return rows.map((row) => Number(row.year));
}

export async function isLiked(
 userId: string,
 kind: MediaKind,
 tmdbId: number,
): Promise<boolean> {
 const rows = await getDb()
  .select({ id: mediaLike.id })
  .from(mediaLike)
  .where(
   and(
    eq(mediaLike.userId, userId),
    eq(mediaLike.kind, kind),
    eq(mediaLike.tmdbId, tmdbId),
   ),
  )
  .limit(1);
 return rows.length > 0;
}

export async function getLikedKeys(
 userId: string,
 refs: MediaRef[],
): Promise<Set<string>> {
 if (refs.length === 0) return new Set();
 const db = getDb();
 const pages = await Promise.all(
  chunkRefs(refs).map((chunk) => {
   const { kinds, tmdbIds } = refFilter(chunk);
   return db
    .select({ kind: mediaLike.kind, tmdbId: mediaLike.tmdbId })
    .from(mediaLike)
    .where(
     and(
      eq(mediaLike.userId, userId),
      inArray(mediaLike.kind, kinds),
      inArray(mediaLike.tmdbId, tmdbIds),
     ),
    );
  }),
 );
 return new Set(pages.flat().map((row) => mediaKey(row)));
}

export async function getLikedTitles(
 userId: string,
 opts: { limit: number; offset?: number },
): Promise<MediaRef[]> {
 const rows = await getDb()
  .select({ kind: mediaLike.kind, tmdbId: mediaLike.tmdbId })
  .from(mediaLike)
  .where(eq(mediaLike.userId, userId))
  .orderBy(desc(mediaLike.createdAt), desc(mediaLike.id))
  .limit(opts.limit)
  .offset(opts.offset ?? 0);
 return rows.map((row) => ({ kind: row.kind, tmdbId: row.tmdbId }));
}

/**
 * Always length 4, index = slot. `favorite_user_position` is
 * UNIQUE, so at most one row per position — empty slots are null.
 */
export async function getFavorites(
 userId: string,
): Promise<(MediaRef | null)[]> {
 const rows = await getDb()
  .select({
   kind: favorite.kind,
   tmdbId: favorite.tmdbId,
   position: favorite.position,
  })
  .from(favorite)
  .where(eq(favorite.userId, userId));

 const slots: (MediaRef | null)[] = [null, null, null, null];
 for (const row of rows) {
  if (row.position >= 0 && row.position < 4) {
   slots[row.position] = { kind: row.kind, tmdbId: row.tmdbId };
  }
 }
 return slots;
}

export interface ProfileStats {
 watchedMovies: number;
 watchedSeries: number;
 watchEntries: number;
 entriesThisYear: number;
 ratings: number;
 reviews: number;
 likes: number;
}

/**
 * Profile counts. Title counts use `COUNT(DISTINCT)` — a
 * rewatch is one watched title — and the rest are plain
 * `COUNT(*)`. One statement; follower counts are deliberately
 * absent (they come from `lib/social/queries.ts`).
 */
export async function getProfileStats(
 userId: string,
): Promise<ProfileStats> {
 const [watched, entries, ratings, reviews, likes] = await Promise.all([
  getDb()
   .select({
    movies: sql<number>`count(distinct case when ${watchEntry.kind} = 'movie' then ${watchEntry.tmdbId} end)`,
    series: sql<number>`count(distinct case when ${watchEntry.kind} = 'tv' then ${watchEntry.tmdbId} end)`,
   })
   .from(watchEntry)
   .where(eq(watchEntry.userId, userId)),
  getDb()
   .select({
    total: sql<number>`count(*)`,
    thisYear: sql<number>`count(case when strftime('%Y', ${watchEntry.watchedAt} / 1000, 'unixepoch') = strftime('%Y', 'now') then 1 end)`,
   })
   .from(watchEntry)
   .where(eq(watchEntry.userId, userId)),
  getDb()
   .select({ total: sql<number>`count(*)` })
   .from(rating)
   .where(eq(rating.userId, userId)),
  getDb()
   .select({ total: sql<number>`count(*)` })
   .from(review)
   .where(eq(review.userId, userId)),
  getDb()
   .select({ total: sql<number>`count(*)` })
   .from(mediaLike)
   .where(eq(mediaLike.userId, userId)),
 ]);

 return {
  watchedMovies: watched[0]?.movies ?? 0,
  watchedSeries: watched[0]?.series ?? 0,
  watchEntries: entries[0]?.total ?? 0,
  entriesThisYear: entries[0]?.thisYear ?? 0,
  ratings: ratings[0]?.total ?? 0,
  reviews: reviews[0]?.total ?? 0,
  likes: likes[0]?.total ?? 0,
 };
}
