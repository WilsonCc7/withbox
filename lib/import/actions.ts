"use server";

import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rating, watchEntry, watchlistItem } from "@/db/schema";
import { getDb } from "@/lib/db";
import { chunkRefs, getWatchlistKeys } from "@/lib/library/queries";
import { mediaKey, type MediaRef } from "@/lib/library/types";
import type { MediaKind } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";
import { parseCsv } from "./csv";
import { detectExport, toWatchIntent, type WatchIntent } from "./library";

/**
 * Server action behind the import form. It takes `FormData` and reports its
 * outcome through the redirect's query string, so the page works as a plain
 * `<form method="post" enctype="multipart/form-data">` with JavaScript
 * disabled — the same no-JS path every other action in this project keeps.
 */

/** Rows handled per submission. `parseCsv` accepts more; the rest is skipped. */
const MAX_ROWS = 500;

/** Mirrors `requireUser` in `lib/library/actions.ts`, which is module-private. */
async function requireUser(): Promise<{ id: string }> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * Mirrors `pathsForMedia` in `lib/library/actions.ts`, which is module-private:
 * repeating eight strings is cheaper than exporting a helper from a module
 * this action has no other reason to touch.
 */
function pathsForMedia(
  userId: string,
  kind: MediaKind,
  tmdbId: number,
): string[] {
  return [
    "/",
    kind === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
    "/watched",
    "/watchlist",
    "/diary",
    "/feed",
    `/u/${userId}`,
  ];
}

/** IMDb writes the year inside `Title`; the `Year` column, when present, wins. */
function bareTitle(raw: string): string {
  return raw.replace(/\s*\(\d{4}\)\s*$/, "").trim();
}

/**
 * Resolver with two memo maps, so a file that logs the same title twice makes
 * one upstream call, not two. Every call goes through `mediaSource()`, which
 * is the cached, rate-limited source.
 *
 * Matching is deliberately strict — an exact, case-insensitive title equality
 * plus the row's year when it carries one — because a wrong import is worse
 * than a missed one. The year is a filter, never part of the query: `search()`
 * takes no year parameter, and a fixture query matches by substring, so
 * `"Fight Club 1999"` would match nothing.
 */
function createResolver(): (intent: WatchIntent) => Promise<MediaRef | null> {
  const byImdb = new Map<string, MediaRef | null>();
  const byTitle = new Map<string, MediaRef | null>();

  async function searchByTitle(intent: WatchIntent): Promise<MediaRef | null> {
    const title = bareTitle(intent.title);
    if (title === "") return null;
    const page = await mediaSource().search(title, "multi");
    const needle = title.toLowerCase();
    const match = page.items.find(
      (item) =>
        bareTitle(item.title).toLowerCase() === needle &&
        (intent.year === null || item.year === intent.year),
    );
    return match === undefined ? null : { kind: match.kind, tmdbId: match.tmdbId };
  }

  return async function resolveRef(intent: WatchIntent): Promise<MediaRef | null> {
    if (intent.imdbId !== null) {
      const cached = byImdb.get(intent.imdbId);
      if (cached !== undefined) return cached;
      const found = await mediaSource().findByImdbId(intent.imdbId);
      byImdb.set(intent.imdbId, found);
      // The fixture source carries no IMDb ids, so a miss falls through to the
      // title match instead of losing the row.
      if (found !== null) return found;
    }

    const key = `${bareTitle(intent.title).toLowerCase()}|${intent.year ?? ""}`;
    const cached = byTitle.get(key);
    if (cached !== undefined) return cached;
    const found = await searchByTitle(intent);
    byTitle.set(key, found);
    return found;
  };
}

/**
 * `kind:tmdbId:day` keys already in the user's diary for these refs, in a
 * bounded number of statements (`inArray` on both columns stays under D1's 100
 * bound parameters thanks to `chunkRefs`; the kind column has two values at
 * most).
 */
async function watchedDays(
  userId: string,
  refs: MediaRef[],
): Promise<Set<string>> {
  const days = new Set<string>();
  if (refs.length === 0) return days;

  const db = getDb();
  const pages = await Promise.all(
    chunkRefs(refs).map((chunk) => {
      const kinds = [...new Set(chunk.map((ref) => ref.kind))];
      return db
        .select({
          kind: watchEntry.kind,
          tmdbId: watchEntry.tmdbId,
          watchedAt: watchEntry.watchedAt,
        })
        .from(watchEntry)
        .where(
          and(
            eq(watchEntry.userId, userId),
            inArray(watchEntry.kind, kinds),
            inArray(watchEntry.tmdbId, chunk.map((ref) => ref.tmdbId)),
          ),
        );
    }),
  );

  for (const page of pages) {
    for (const row of page) {
      // UTC day, the day the diary groups by (`strftime('%Y-%m-%d')`).
      const day = row.watchedAt.toISOString().slice(0, 10);
      days.add(`${row.kind}:${row.tmdbId}:${day}`);
    }
  }
  return days;
}

/** `mediaKey`s the user has already rated, same chunked shape. */
async function ratedKeys(userId: string, refs: MediaRef[]): Promise<Set<string>> {
  const keys = new Set<string>();
  if (refs.length === 0) return keys;

  const db = getDb();
  const pages = await Promise.all(
    chunkRefs(refs).map((chunk) => {
      const kinds = [...new Set(chunk.map((ref) => ref.kind))];
      return db
        .select({ kind: rating.kind, tmdbId: rating.tmdbId })
        .from(rating)
        .where(
          and(
            eq(rating.userId, userId),
            inArray(rating.kind, kinds),
            inArray(rating.tmdbId, chunk.map((ref) => ref.tmdbId)),
          ),
        );
    }),
  );

  for (const page of pages) {
    for (const row of page) {
      keys.add(mediaKey({ kind: row.kind, tmdbId: row.tmdbId }));
    }
  }
  return keys;
}

export async function importLibrary(formData: FormData): Promise<void> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/settings/import?error=file");
  }

  let rows: string[][];
  try {
    rows = parseCsv(await file.text());
  } catch {
    // `parseCsv` throws for a file over its caps (5 MB / 5000 rows) and for
    // nothing else, which is a problem with the file the user picked.
    redirect("/settings/import?error=file");
  }

  // `detectExport` reads column names off the first row; an empty file has
  // none, which is the same failure as a header that matches neither export.
  // The filename is passed because `watched.csv` and `watchlist.csv` are the
  // same header byte for byte.
  const kind = rows.length === 0 ? null : detectExport(rows[0], file.name);
  if (kind === null) {
    redirect("/settings/import?error=format");
  }

  const intents = toWatchIntent(rows, kind);
  const accepted = intents.slice(0, MAX_ROWS);
  // Rows past the cap are reported as skipped rather than silently dropped.
  let skipped = intents.length - accepted.length;
  let missing = 0;

  const resolveRef = createResolver();
  const resolved: {
    ref: MediaRef;
    watchedAt: Date;
    rating: number | null;
  }[] = [];

  for (const intent of accepted) {
    const ref = await resolveRef(intent);
    if (ref === null) {
      missing++;
      continue;
    }
    resolved.push({
      ref,
      // `logWatch` stamps a row with no parseable date "now"; the parser
      // already rejected rollovers, so a null here means the export had no
      // date for this row at all.
      watchedAt: intent.watchedAt ?? new Date(),
      rating: intent.rating,
    });
  }

  const db = getDb();

  // A watchlist export is the same header as `watched.csv`, so `detectExport`
  // already said which one this is. A watchlist entry is an intent to watch:
  // this path writes no `watch_entry` row and no score.
  if (kind === "letterboxd-watchlist") {
    // Insert-if-absent against the unique index, like `toggleWatchlist`: the
    // pre-check makes a re-run report `skipped` instead of quietly conflicting.
    const existing = await getWatchlistKeys(user.id, resolved.map((row) => row.ref));
    const inserts: BatchItem<"sqlite">[] = [];
    const added: MediaRef[] = [];

    for (const row of resolved) {
      const key = mediaKey(row.ref);
      if (existing.has(key)) {
        skipped++;
        continue;
      }
      // Two rows for one title inside one file are one entry.
      existing.add(key);
      added.push(row.ref);
      inserts.push(
        db
          .insert(watchlistItem)
          .values({
            id: crypto.randomUUID(),
            userId: user.id,
            kind: row.ref.kind,
            tmdbId: row.ref.tmdbId,
            // The row's own `Date`, or `now` when the export had none.
            addedAt: row.watchedAt,
          })
          .onConflictDoNothing(),
      );
    }

    if (inserts.length > 0) {
      const [first, ...rest] = inserts;
      await db.batch([first, ...rest]);
    }

    const paths = new Set<string>(["/", "/watchlist", `/u/${user.id}`]);
    for (const ref of added) {
      for (const path of pathsForMedia(user.id, ref.kind, ref.tmdbId)) {
        paths.add(path);
      }
    }
    for (const path of paths) {
      revalidatePath(path);
    }

    redirect(
      `/settings/import?done=${added.length}&skipped=${skipped}&missing=${missing}`,
    );
  }

  // `watch_entry` has no unique index — a repeated row is a legitimate rewatch
  // — so this check, not a constraint, is what makes re-running the same file
  // add nothing.
  const seen = await watchedDays(user.id, resolved.map((row) => row.ref));
  const saved: typeof resolved = [];
  for (const row of resolved) {
    // UTC day, the day the diary groups by.
    const day = row.watchedAt.toISOString().slice(0, 10);
    const key = `${mediaKey(row.ref)}:${day}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    // Two rows for the same title and day inside one file are one watch.
    seen.add(key);
    saved.push(row);
  }

  // One score per title, latest row in the file wins.
  const scores = new Map<string, { ref: MediaRef; value: number }>();
  for (const row of saved) {
    if (row.rating === null) continue;
    scores.set(mediaKey(row.ref), { ref: row.ref, value: row.rating });
  }
  const alreadyRated = await ratedKeys(
    user.id,
    [...scores.values()].map((score) => score.ref),
  );

  const now = new Date();
  const statements: BatchItem<"sqlite">[] = [];

  for (const row of saved) {
    statements.push(
      db
        .insert(watchEntry)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          kind: row.ref.kind,
          tmdbId: row.ref.tmdbId,
          season: null,
          episode: null,
          rewatch: false,
          watchedAt: row.watchedAt,
        })
        // No unique index to conflict on; kept so every read-then-write insert
        // in the actions has the same shape (see `markWatched`).
        .onConflictDoNothing(),
    );
  }

  for (const [key, score] of scores) {
    // Mirrors `upsertRating` in `lib/library/actions.ts` (module-private):
    // read-then-write, one row per user+title, `onConflictDoNothing` on the
    // insert path. The read happened above so the whole import is one batch.
    if (alreadyRated.has(key)) {
      statements.push(
        db
          .update(rating)
          .set({ value: score.value, updatedAt: now })
          .where(
            and(
              eq(rating.userId, user.id),
              eq(rating.kind, score.ref.kind),
              eq(rating.tmdbId, score.ref.tmdbId),
            ),
          ),
      );
    } else {
      statements.push(
        db
          .insert(rating)
          .values({
            id: crypto.randomUUID(),
            userId: user.id,
            kind: score.ref.kind,
            tmdbId: score.ref.tmdbId,
            value: score.value,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing(),
      );
    }
  }

  if (statements.length > 0) {
    // One batch: D1 runs its statements sequentially inside one transaction
    // (`db.transaction` is rejected), so the import lands whole or not at all.
    const [first, ...rest] = statements;
    await db.batch([first, ...rest]);
  }

  const paths = new Set<string>([
    "/",
    "/watched",
    "/diary",
    "/feed",
    `/u/${user.id}`,
    "/stats",
  ]);
  for (const row of saved) {
    for (const path of pathsForMedia(user.id, row.ref.kind, row.ref.tmdbId)) {
      paths.add(path);
    }
  }
  for (const path of paths) {
    revalidatePath(path);
  }

  redirect(
    `/settings/import?done=${saved.length}&skipped=${skipped}&missing=${missing}`,
  );
}
