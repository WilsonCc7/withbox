import { and, desc, eq, sql } from "drizzle-orm";
import { favorite, mediaLike, rating, review, watchEntry } from "@/db/schema";
import { getDb } from "@/lib/db";
import { mediaKey, type MediaRef } from "@/lib/library/types";
import { mediaSource } from "@/lib/media/runtime";
import type { MediaDetail, MediaKind } from "@/lib/media/types";

/**
 * How many titles' metadata is resolved for the genre tally. A library
 * larger than this still reports its true `titleCount`; the genre figures
 * then cover only the newest `cappedAt` titles, which the page says out
 * loud.
 */
export const GENRE_TITLE_CAP = 300;

/** Detail calls in flight at once. They are KV-cached and rate-limited. */
const RESOLVE_CHUNK = 30;

/** Highest-rated titles listed on the page. */
const TOP_RATED_LIMIT = 12;

/** `watchedAt` is integer milliseconds; `strftime`/`date` take seconds. */
const SECONDS = sql`${watchEntry.watchedAt} / 1000`;

const YEAR_OF_WATCH = sql<number>`strftime('%Y', ${SECONDS}, 'unixepoch')`;

/** Calendar day of a watch, UTC — one row per distinct day feeds the streak. */
const DAY_OF_WATCH = sql<string>`date(${SECONDS}, 'unixepoch')`;

export interface LibraryStats {
  films: number;
  series: number;
  episodes: number;
  diaryEntries: number;
  rewatches: number;
  ratings: { count: number; average: number | null };
  reviews: number;
  likes: number;
  favorites: number;
  byYear: { year: number; count: number }[];
  topRated: {
    ref: MediaRef;
    title: string;
    year: number | null;
    posterPath: string | null;
    value: number;
  }[];
  genres: { name: string; count: number }[];
  longestStreak: number;
  firstWatch: Date | null;
  titleCount: number;
  cappedAt: number;
}

/** Longest run of consecutive calendar days in an ascending, deduped list. */
function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    const ms = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(ms)) continue;
    run = previous !== null && ms - previous === 86_400_000 ? run + 1 : 1;
    previous = ms;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Everything the stats page shows, derived from the user's own rows.
 *
 * `opts.year` filters exactly the numbers that come from `watch_entry`
 * dates: films, series, episodes, diary entries, rewatches, the longest
 * streak and the first watch. `byYear` stays the full history (it is the
 * year picker itself), and the title-level tables — ratings, reviews,
 * likes, favourites, top rated — have no watch date to filter by, so they
 * always report all time. `titleCount` and `genres` are all time too: the
 * cap drops the oldest titles, which only makes sense against the whole
 * library.
 *
 * `rewatches` is the stored `watch_entry.rewatch` flag, the same
 * definition the diary shows per row (`actions.ts` sets it when the
 * checkbox is submitted or an earlier row already exists for the title) —
 * not a second, derived notion of a repeat viewing.
 *
 * Counts and groupings are D1-only. Metadata resolution is bounded by
 * `GENRE_TITLE_CAP` and goes through the shared `MediaSource`, so an empty
 * library resolves nothing and every number is zero.
 */
export async function getLibraryStats(
  userId: string,
  opts: { year?: number } = {},
): Promise<LibraryStats> {
  const db = getDb();
  const year = opts.year ?? null;
  const scope = [eq(watchEntry.userId, userId)];
  if (year !== null) {
    scope.push(sql`${YEAR_OF_WATCH} = ${String(year)}`);
  }
  const watchWhere = and(...scope);

  const [
    watch,
    days,
    byYear,
    scores,
    reviewCount,
    likeCount,
    favoriteCount,
    latestRefs,
    ratedRefs,
    titleTotal,
  ] = await Promise.all([
      db
        .select({
          films: sql<number>`count(distinct case when ${watchEntry.kind} = 'movie' then ${watchEntry.tmdbId} end)`,
          series: sql<number>`count(distinct case when ${watchEntry.kind} = 'tv' then ${watchEntry.tmdbId} end)`,
          entries: sql<number>`count(*)`,
          episodes: sql<number>`count(case when ${watchEntry.episode} is not null then 1 end)`,
          rewatches: sql<number>`count(case when ${watchEntry.rewatch} = 1 then 1 end)`,
          first: sql<number | null>`min(${watchEntry.watchedAt})`,
        })
        .from(watchEntry)
        .where(watchWhere),
      db
        .selectDistinct({ day: DAY_OF_WATCH })
        .from(watchEntry)
        .where(watchWhere)
        // Same expression in ORDER BY, never an alias: drizzle emits the
        // projection unnamed and SQLite then reads a bare `day` as a column
        // of watch_entry ("no such column: day").
        .orderBy(DAY_OF_WATCH),
      db
        .select({ year: YEAR_OF_WATCH, count: sql<number>`count(*)` })
        .from(watchEntry)
        .where(eq(watchEntry.userId, userId))
        .groupBy(YEAR_OF_WATCH)
        .orderBy(desc(YEAR_OF_WATCH)),
      db
        .select({
          total: sql<number>`count(*)`,
          average: sql<number | null>`avg(${rating.value})`,
        })
        .from(rating)
        .where(eq(rating.userId, userId)),
      db
        .select({ total: sql<number>`count(*)` })
        .from(review)
        .where(eq(review.userId, userId)),
      db
        .select({ total: sql<number>`count(*)` })
        .from(mediaLike)
        .where(eq(mediaLike.userId, userId)),
      db
        .select({ total: sql<number>`count(*)` })
        .from(favorite)
        .where(eq(favorite.userId, userId)),
      // Newest watch per title, so the cap drops the oldest titles first.
      db
        .select({
          kind: watchEntry.kind,
          tmdbId: watchEntry.tmdbId,
          latest: sql<number>`max(${watchEntry.watchedAt})`,
        })
        .from(watchEntry)
        .where(eq(watchEntry.userId, userId))
        .groupBy(watchEntry.kind, watchEntry.tmdbId)
        .orderBy(desc(sql`max(${watchEntry.watchedAt})`))
        .limit(GENRE_TITLE_CAP),
      db
        .select({ kind: rating.kind, tmdbId: rating.tmdbId, value: rating.value })
        .from(rating)
        .where(eq(rating.userId, userId))
        .orderBy(desc(rating.value), desc(rating.updatedAt))
        .limit(TOP_RATED_LIMIT),
      // All time, never year-scoped: it is the inventory the genre cap
      // applies to, so the page can say "the newest 300 of N titles".
      db
        .select({
          titles: sql<number>`count(distinct ${watchEntry.kind} || ':' || ${watchEntry.tmdbId})`,
        })
        .from(watchEntry)
        .where(eq(watchEntry.userId, userId)),
    ]);

  // One detail call per distinct title, shared by the genre tally and the
  // top-rated grid, in chunks so a cold cache cannot fan out to 300 calls.
  const wanted = new Map<string, MediaRef>();
  for (const row of [...latestRefs, ...ratedRefs]) {
    wanted.set(mediaKey(row), { kind: row.kind, tmdbId: row.tmdbId });
  }
  const refs = [...wanted.values()];
  const source = mediaSource();
  const details = new Map<string, MediaDetail>();
  for (let i = 0; i < refs.length; i += RESOLVE_CHUNK) {
    const chunk = refs.slice(i, i + RESOLVE_CHUNK);
    const resolved = await Promise.all(
      chunk.map((ref): Promise<MediaDetail | null> =>
        ref.kind === "movie" ? source.movie(ref.tmdbId) : source.tv(ref.tmdbId),
      ),
    );
    resolved.forEach((detail, index) => {
      if (detail) details.set(mediaKey(chunk[index]), detail);
    });
  }

  const genreCounts = new Map<string, number>();
  for (const row of latestRefs) {
    const detail = details.get(mediaKey(row));
    if (!detail) continue;
    for (const genre of detail.genres) {
      genreCounts.set(genre.name, (genreCounts.get(genre.name) ?? 0) + 1);
    }
  }

  const topRated: LibraryStats["topRated"] = [];
  for (const row of ratedRefs) {
    const ref: MediaRef = { kind: row.kind, tmdbId: row.tmdbId };
    const detail = details.get(mediaKey(ref));
    if (!detail) continue;
    topRated.push({
      ref,
      title: detail.title,
      year: detail.year,
      posterPath: detail.posterPath,
      value: row.value,
    });
  }

  const first = watch[0]?.first ?? null;
  const average = scores[0]?.average ?? null;

  return {
    films: Number(watch[0]?.films ?? 0),
    series: Number(watch[0]?.series ?? 0),
    episodes: Number(watch[0]?.episodes ?? 0),
    diaryEntries: Number(watch[0]?.entries ?? 0),
    rewatches: Number(watch[0]?.rewatches ?? 0),
    ratings: {
      count: Number(scores[0]?.total ?? 0),
      average: average === null ? null : Number(average),
    },
    reviews: Number(reviewCount[0]?.total ?? 0),
    likes: Number(likeCount[0]?.total ?? 0),
    favorites: Number(favoriteCount[0]?.total ?? 0),
    byYear: byYear.map((row) => ({
      year: Number(row.year),
      count: Number(row.count),
    })),
    topRated,
    genres: [...genreCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    longestStreak: longestRun(days.map((row) => row.day)),
    firstWatch: first === null ? null : new Date(Number(first)),
    titleCount: Number(titleTotal[0]?.titles ?? 0),
    cappedAt: GENRE_TITLE_CAP,
  };
}
