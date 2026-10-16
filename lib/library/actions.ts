"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/lib/db";
import {
 favorite,
 mediaLike,
 playbackProgress,
 rating,
 review,
 watchEntry,
 watchlistItem,
} from "@/db/schema";
import type { MediaKind } from "@/lib/media/types";
import { currentUser } from "@/lib/session";
import { progressSlot } from "./types";

/**
 * Server actions. Every one takes `FormData` so a plain
 * `<form action={...}>` works with JavaScript disabled.
 */

function parseKind(raw: FormDataEntryValue | null): MediaKind {
 if (raw !== "movie" && raw !== "tv") {
  throw new Error(`invalid kind: ${String(raw)}`);
 }
 return raw;
}

function parseTmdbId(raw: FormDataEntryValue | null): number {
 const value = Number(raw);
 if (!Number.isInteger(value) || value <= 0) {
  throw new Error(`invalid tmdbId: ${String(raw)}`);
 }
 return value;
}

function parseNonNegativeInt(
 raw: FormDataEntryValue | null,
 field: string,
): number {
 const value = Number(raw);
 if (!Number.isInteger(value) || value < 0) {
  throw new Error(`invalid ${field}: ${String(raw)}`);
 }
 return value;
}

/** Absent/empty means "not applicable" (a film has no season), not an error. */
function parseOptionalNonNegativeInt(
 raw: FormDataEntryValue | null,
 field: string,
): number | null {
 if (raw === null || raw === "") return null;
 return parseNonNegativeInt(raw, field);
}

/**
 * The full identity of one watchable thing: a film is
 * (kind, tmdbId, null, null), an episode is (kind, tmdbId, season, episode).
 *
 * Every action that reads or writes a watch row goes through this. Matching on
 * only (userId, kind, tmdbId) once made marking S01E02 delete the whole series,
 * so the predicates are deliberately built in one place.
 *
 * NULL needs `isNull`, not `eq(col, null)` — the latter compiles to `= NULL`,
 * which matches nothing in SQLite.
 */
function watchKey(
 userId: string,
 kind: MediaKind,
 tmdbId: number,
 season: number | null,
 episode: number | null,
) {
 return [
  eq(watchEntry.userId, userId),
  eq(watchEntry.kind, kind),
  eq(watchEntry.tmdbId, tmdbId),
  season === null ? isNull(watchEntry.season) : eq(watchEntry.season, season),
  episode === null ? isNull(watchEntry.episode) : eq(watchEntry.episode, episode),
 ];
}

function parseEpisodeList(raw: FormDataEntryValue | null): number[] {
 const value = String(raw ?? "");
 if (value.trim() === "") return [];
 const episodes = value
  .split(",")
  .map((part) => part.trim())
  .filter((part) => part !== "")
  .map((part) => {
   const n = Number(part);
   if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid episode: ${part}`);
   }
   return n;
  });
 return [...new Set(episodes)];
}

/**
 * The single place defining which paths a media write revalidates.
 * `userId` puts the user's profile page on the list.
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

/** Pages that derive from a season's episode marks. */
function pathsForSeason(tmdbId: number, season: number): string[] {
 return ["/", `/tv/${tmdbId}`, `/tv/${tmdbId}/season/${season}`];
}

async function revalidatePaths(paths: string[]): Promise<void> {
 for (const path of paths) {
  revalidatePath(path);
 }
}

async function requireUser(): Promise<{ id: string }> {
 const user = await currentUser();
 if (!user) redirect("/sign-in");
 return user;
}

export async function toggleWatched(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const season = parseOptionalNonNegativeInt(formData.get("season"), "season");
 const episode = parseOptionalNonNegativeInt(formData.get("episode"), "episode");

 const db = getDb();
 const key = watchKey(user.id, kind, tmdbId, season, episode);

 const existing = await db
  .select({ id: watchEntry.id })
  .from(watchEntry)
  .where(and(...key))
  .limit(1);

 if (existing.length > 0) {
  // Toggle off: delete every row for this key (rewatches included).
  await db.delete(watchEntry).where(and(...key));
 } else {
  await db.insert(watchEntry).values({
   id: crypto.randomUUID(),
   userId: user.id,
   kind,
   tmdbId,
   season,
   episode,
   watchedAt: new Date(),
  });
 }
 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

/**
 * Idempotent "mark watched", for the player's completion signal.
 *
 * Deliberately not `toggleWatched`: a player reports completion more than once
 * (seek past the end, replay, a duplicate postMessage), and a toggle would
 * un-watch the title on the second call.
 */
export async function markWatched(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const season = parseOptionalNonNegativeInt(formData.get("season"), "season");
 const episode = parseOptionalNonNegativeInt(formData.get("episode"), "episode");

 const db = getDb();
 const key = watchKey(user.id, kind, tmdbId, season, episode);
 const existing = await db
  .select({ id: watchEntry.id })
  .from(watchEntry)
  .where(and(...key))
  .limit(1);

 if (existing.length === 0) {
  await db.insert(watchEntry).values({
   id: crypto.randomUUID(),
   userId: user.id,
   kind,
   tmdbId,
   season,
   episode,
   watchedAt: new Date(),
  });
 }

 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

/** Removal counterpart to `markWatched`; used when a mark was set by mistake. */
export async function unmarkWatched(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const season = parseOptionalNonNegativeInt(formData.get("season"), "season");
 const episode = parseOptionalNonNegativeInt(formData.get("episode"), "episode");

 await getDb()
  .delete(watchEntry)
  .where(and(...watchKey(user.id, kind, tmdbId, season, episode)));

 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

/**
 * One rating row per (userId, kind, tmdbId): update when a row exists,
 * insert otherwise. Shared by `setRating` and `logWatch`.
 */
async function upsertRating(
 db: Db,
 userId: string,
 kind: MediaKind,
 tmdbId: number,
 value: number,
 now: Date,
): Promise<void> {
 const existing = await db
  .select({ id: rating.id })
  .from(rating)
  .where(
   and(eq(rating.userId, userId), eq(rating.kind, kind), eq(rating.tmdbId, tmdbId)),
  )
  .limit(1);

 if (existing.length > 0) {
  await db
   .update(rating)
   .set({ value, updatedAt: now })
   .where(
    and(eq(rating.userId, userId), eq(rating.kind, kind), eq(rating.tmdbId, tmdbId)),
   );
 } else {
  await db.insert(rating).values({
   id: crypto.randomUUID(),
   userId,
   kind,
   tmdbId,
   value,
   createdAt: now,
   updatedAt: now,
  });
 }
}

/**
 * One review row per (userId, kind, tmdbId): update when a row exists,
 * insert otherwise. Shared by `setReview` and `logWatch`.
 */
async function upsertReview(
 db: Db,
 userId: string,
 kind: MediaKind,
 tmdbId: number,
 body: string,
 containsSpoilers: boolean,
 now: Date,
): Promise<void> {
 const existing = await db
  .select({ id: review.id })
  .from(review)
  .where(
   and(eq(review.userId, userId), eq(review.kind, kind), eq(review.tmdbId, tmdbId)),
  )
  .limit(1);

 if (existing.length > 0) {
  await db
   .update(review)
   .set({ body, containsSpoilers, updatedAt: now })
   .where(
    and(eq(review.userId, userId), eq(review.kind, kind), eq(review.tmdbId, tmdbId)),
   );
 } else {
  await db.insert(review).values({
   id: crypto.randomUUID(),
   userId,
   kind,
   tmdbId,
   body,
   containsSpoilers,
   createdAt: now,
   updatedAt: now,
  });
 }
}

export async function setRating(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const raw = formData.get("value");

 // "" or "0" clears the rating.
 if (raw === "" || raw === "0") {
  await getDb()
   .delete(rating)
   .where(
    and(eq(rating.userId, user.id), eq(rating.kind, kind), eq(rating.tmdbId, tmdbId)),
   );
  await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
  return;
 }

 const value = Number(raw);
 if (!Number.isInteger(value) || value < 1 || value > 10) {
  throw new Error(`invalid rating: ${String(raw)}`);
 }

 await upsertRating(getDb(), user.id, kind, tmdbId, value, new Date());
 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

export async function setReview(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const body = String(formData.get("body") ?? "");
 const containsSpoilers =
  formData.get("containsSpoilers") === "on" ||
  formData.get("containsSpoilers") === "true";

 if (body.trim() === "") {
  await getDb()
   .delete(review)
   .where(
    and(eq(review.userId, user.id), eq(review.kind, kind), eq(review.tmdbId, tmdbId)),
   );
  await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
  return;
 }

 await upsertReview(getDb(), user.id, kind, tmdbId, body, containsSpoilers, new Date());
 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

export async function toggleWatchlist(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));

 const db = getDb();
 const existing = await db
  .select({ id: watchlistItem.id })
  .from(watchlistItem)
  .where(
   and(
    eq(watchlistItem.userId, user.id),
    eq(watchlistItem.kind, kind),
    eq(watchlistItem.tmdbId, tmdbId),
   ),
  )
  .limit(1);

 if (existing.length > 0) {
  await db
   .delete(watchlistItem)
   .where(
    and(
     eq(watchlistItem.userId, user.id),
     eq(watchlistItem.kind, kind),
     eq(watchlistItem.tmdbId, tmdbId),
    ),
   );
 } else {
  await db.insert(watchlistItem).values({
   id: crypto.randomUUID(),
   userId: user.id,
   kind,
   tmdbId,
   addedAt: new Date(),
  });
 }
 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

export async function markSeason(formData: FormData): Promise<void> {
 const user = await requireUser();
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const season = parseNonNegativeInt(formData.get("season"), "season");
 const requested = parseEpisodeList(formData.get("episodes"));
 if (requested.length === 0) {
  throw new Error("no episodes supplied");
 }

 const db = getDb();
 // Skip episodes already recorded (any row for the (season, episode)
 // pair counts as watched, rewatches included).
 const existingRows = await db
  .select({ episode: watchEntry.episode })
  .from(watchEntry)
  .where(
   and(
    eq(watchEntry.userId, user.id),
    eq(watchEntry.kind, "tv"),
    eq(watchEntry.tmdbId, tmdbId),
    eq(watchEntry.season, season),
    inArray(watchEntry.episode, requested),
   ),
  );
 const recorded = new Set(existingRows.map((row) => row.episode));
 const fresh = requested.filter((episode) => !recorded.has(episode));
 if (fresh.length > 0) {
  const now = new Date();
  await db.insert(watchEntry).values(
   fresh.map((episode) => ({
    id: crypto.randomUUID(),
    userId: user.id,
    kind: "tv" as const,
    tmdbId,
    season,
    episode,
    watchedAt: now,
   })),
  );
 }
 await revalidatePaths(pathsForSeason(tmdbId, season));
}

/**
 * Progress fields arrive from a client timer, so nothing here throws —
 * a malformed value reports `malformed` and the action returns
 * silently. An absent optional field parses to `null` ("not
 * applicable"), matching the watch-entry parsers above.
 */
function parseProgressField(
 raw: FormDataEntryValue | null,
): { value: number | null; malformed: boolean } {
 const trimmed = String(raw ?? "").trim();
 if (trimmed === "") return { value: null, malformed: false };
 const value = Number(trimmed);
 if (!Number.isInteger(value) || value < 0) {
  return { value: null, malformed: true };
 }
 return { value, malformed: false };
}

/**
 * Playback position, reported by the player's timer.
 *
 * Upserts in ONE statement on (userId, slotKey): it is called
 * repeatedly and concurrently from a player, so a read-then-write
 * would race. Never throws or redirects — a client timer must not
 * surface errors — and deliberately revalidates nothing: it fires too
 * often to invalidate renders. A `position` of 0 is stored; the page
 * decides what counts as resumable.
 */
export async function saveProgress(formData: FormData): Promise<void> {
 const user = await currentUser();
 if (!user) return;

 const kind = formData.get("kind");
 if (kind !== "movie" && kind !== "tv") return;

 const tmdbId = parseProgressField(formData.get("tmdbId"));
 const position = parseProgressField(formData.get("position"));
 if (
  tmdbId.malformed ||
  tmdbId.value === null ||
  tmdbId.value <= 0 ||
  position.malformed ||
  position.value === null
 ) {
  return;
 }

 const season = parseProgressField(formData.get("season"));
 const episode = parseProgressField(formData.get("episode"));
 const duration = parseProgressField(formData.get("duration"));
 if (season.malformed || episode.malformed || duration.malformed) return;

 const db = getDb();
 await db
  .insert(playbackProgress)
  .values({
   id: crypto.randomUUID(),
   userId: user.id,
   kind,
   tmdbId: tmdbId.value,
   season: season.value,
   episode: episode.value,
   slotKey: progressSlot(kind, tmdbId.value, season.value, episode.value),
   positionSeconds: position.value,
   durationSeconds: duration.value,
   updatedAt: new Date(),
  })
  .onConflictDoUpdate({
   target: [playbackProgress.userId, playbackProgress.slotKey],
   set: {
    positionSeconds: position.value,
    durationSeconds: duration.value,
    updatedAt: new Date(),
   },
  });
}

/**
 * One diary entry, optionally backdated. `watchedAt` is parsed at noon
 * UTC: a bare `YYYY-MM-DD` parses as midnight, which shifts a day in
 * negative UTC offsets.
 *
 * Rating and review stay title-level (one row per (userId, kind,
 * tmdbId)) — the same upserts `setRating`/`setReview` use.
 */
export async function logWatch(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const season = parseOptionalNonNegativeInt(formData.get("season"), "season");
 const episode = parseOptionalNonNegativeInt(formData.get("episode"), "episode");

 const rawDate = String(formData.get("watchedAt") ?? "");
 if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
  throw new Error("invalid watchedAt");
 }
 // Noon UTC: a bare `YYYY-MM-DD` parses as midnight and shifts a day in
 // negative offsets. The round trip rejects rollovers (`2026-02-31` becomes
 // March 2nd), and the year range keeps a mistyped date from planting a
 // year-504 diary entry that the year filter would then offer forever.
 const watchedAt = new Date(`${rawDate}T12:00:00Z`);
 const year = watchedAt.getUTCFullYear();
 if (
  Number.isNaN(watchedAt.getTime()) ||
  watchedAt.toISOString().slice(0, 10) !== rawDate ||
  year < 1900 ||
  year > 2100
 ) {
  throw new Error("invalid watchedAt");
 }

 const db = getDb();
 // A submitted checkbox counts as a rewatch; so does any earlier row
 // for the same key.
 const existing = await db
  .select({ id: watchEntry.id })
  .from(watchEntry)
  .where(and(...watchKey(user.id, kind, tmdbId, season, episode)))
  .limit(1);
 const rewatch = formData.get("rewatch") !== null || existing.length > 0;

 await db.insert(watchEntry).values({
  id: crypto.randomUUID(),
  userId: user.id,
  kind,
  tmdbId,
  season,
  episode,
  rewatch,
  watchedAt,
 });

 const rawValue = formData.get("value");
 if (rawValue !== null && rawValue !== "") {
  const value = Number(rawValue);
  if (Number.isInteger(value) && value >= 1 && value <= 10) {
   await upsertRating(db, user.id, kind, tmdbId, value, watchedAt);
  }
 }

 const body = String(formData.get("body") ?? "");
 if (body.trim() !== "") {
  const containsSpoilers =
   formData.get("containsSpoilers") === "on" ||
   formData.get("containsSpoilers") === "true";
  await upsertReview(
   db,
   user.id,
   kind,
   tmdbId,
   body,
   containsSpoilers,
   watchedAt,
  );
 }

 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

/**
 * Removes one diary row. Other rows for the same key (rewatches, other
 * episodes) keep the title watched — only `toggleWatched` clears all
 * of them.
 */
export async function deleteWatchEntry(formData: FormData): Promise<void> {
 const user = await requireUser();
 const entryId = String(formData.get("entryId") ?? "");
 if (entryId === "") return;

 const db = getDb();
 const rows = await db
  .select({ kind: watchEntry.kind, tmdbId: watchEntry.tmdbId })
  .from(watchEntry)
  .where(and(eq(watchEntry.id, entryId), eq(watchEntry.userId, user.id)))
  .limit(1);
 const row = rows[0];
 if (!row) return;

 await db
  .delete(watchEntry)
  .where(and(eq(watchEntry.id, entryId), eq(watchEntry.userId, user.id)));

 // pathsForMedia already includes /diary.
 await revalidatePaths(pathsForMedia(user.id, row.kind, row.tmdbId));
}

export async function toggleLiked(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));

 const db = getDb();
 const existing = await db
  .select({ id: mediaLike.id })
  .from(mediaLike)
  .where(
   and(
    eq(mediaLike.userId, user.id),
    eq(mediaLike.kind, kind),
    eq(mediaLike.tmdbId, tmdbId),
   ),
  )
  .limit(1);

 if (existing.length > 0) {
  await db
   .delete(mediaLike)
   .where(
    and(
     eq(mediaLike.userId, user.id),
     eq(mediaLike.kind, kind),
     eq(mediaLike.tmdbId, tmdbId),
    ),
   );
 } else {
  await db.insert(mediaLike).values({
   id: crypto.randomUUID(),
   userId: user.id,
   kind,
   tmdbId,
   createdAt: new Date(),
  });
 }
 await revalidatePaths(pathsForMedia(user.id, kind, tmdbId));
}

/**
 * Pins a title to one of four profile slots. Clicking an already-pinned
 * title unpins it; otherwise the slot's current occupant (if any) and
 * the title's old slot are cleared and the row inserted — in one
 * `db.batch`, because `favorite_user_position` is UNIQUE and D1 has no
 * interactive transactions. `db.batch` is atomic on D1.
 */
export async function setFavorite(formData: FormData): Promise<void> {
 const user = await requireUser();
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));
 const slot = Number(formData.get("slot"));
 if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
  throw new Error(`invalid slot: ${String(formData.get("slot"))}`);
 }

 const db = getDb();
 const existing = await db
  .select({ position: favorite.position })
  .from(favorite)
  .where(
   and(
    eq(favorite.userId, user.id),
    eq(favorite.kind, kind),
    eq(favorite.tmdbId, tmdbId),
   ),
  )
  .limit(1);

 if (existing.length > 0) {
  await db
   .delete(favorite)
   .where(
    and(
     eq(favorite.userId, user.id),
     eq(favorite.kind, kind),
     eq(favorite.tmdbId, tmdbId),
    ),
   );
 } else {
  await db.batch([
   db
    .delete(favorite)
    .where(and(eq(favorite.userId, user.id), eq(favorite.position, slot))),
   // Defensive: the read above already proved no row exists for this
   // title, so this only guards a concurrent write between read and
   // batch.
   db
    .delete(favorite)
    .where(
     and(
      eq(favorite.userId, user.id),
      eq(favorite.kind, kind),
      eq(favorite.tmdbId, tmdbId),
     ),
    ),
   db.insert(favorite).values({
    id: crypto.randomUUID(),
    userId: user.id,
    kind,
    tmdbId,
    position: slot,
    createdAt: new Date(),
   }),
  ]);
 }

 await revalidatePaths([
  `/u/${user.id}`,
  kind === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
 ]);
}
