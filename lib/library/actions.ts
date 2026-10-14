"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { rating, review, watchEntry, watchlistItem } from "@/db/schema";
import type { MediaKind } from "@/lib/media/types";
import { currentUser } from "@/lib/session";

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

/** Pages that derive from this media's watch state. */
function pathsForMedia(kind: MediaKind, tmdbId: number): string[] {
  return ["/", kind === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`];
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
  const rawSeason = formData.get("season");
  const rawEpisode = formData.get("episode");
  const season =
    rawSeason === null || rawSeason === ""
      ? null
      : parseNonNegativeInt(rawSeason, "season");
  const episode =
    rawEpisode === null || rawEpisode === ""
      ? null
      : parseNonNegativeInt(rawEpisode, "episode");

  const db = getDb();

  // The key is the full identity of what was watched: a film is
  // (kind, tmdbId, null, null), an episode is (kind, tmdbId, season, episode).
  // Matching on only (userId, kind, tmdbId) would make marking S01E02 delete
  // every mark for the whole show, because the EXISTS check would find S01E01.
  //
  // NULL needs `isNull`, not `eq(col, null)` — the latter compiles to `= NULL`,
  // which matches nothing in SQLite.
  const key = [
    eq(watchEntry.userId, user.id),
    eq(watchEntry.kind, kind),
    eq(watchEntry.tmdbId, tmdbId),
    season === null ? isNull(watchEntry.season) : eq(watchEntry.season, season),
    episode === null ? isNull(watchEntry.episode) : eq(watchEntry.episode, episode),
  ];

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
  await revalidatePaths(pathsForMedia(kind, tmdbId));
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
    await revalidatePaths(pathsForMedia(kind, tmdbId));
    return;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(`invalid rating: ${String(raw)}`);
  }

  const db = getDb();
  const now = new Date();
  const existing = await db
    .select({ id: rating.id })
    .from(rating)
    .where(
      and(eq(rating.userId, user.id), eq(rating.kind, kind), eq(rating.tmdbId, tmdbId)),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(rating)
      .set({ value, updatedAt: now })
      .where(
        and(eq(rating.userId, user.id), eq(rating.kind, kind), eq(rating.tmdbId, tmdbId)),
      );
  } else {
    await db.insert(rating).values({
      id: crypto.randomUUID(),
      userId: user.id,
      kind,
      tmdbId,
      value,
      createdAt: now,
      updatedAt: now,
    });
  }
  await revalidatePaths(pathsForMedia(kind, tmdbId));
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
    await revalidatePaths(pathsForMedia(kind, tmdbId));
    return;
  }

  const db = getDb();
  const now = new Date();
  const existing = await db
    .select({ id: review.id })
    .from(review)
    .where(
      and(eq(review.userId, user.id), eq(review.kind, kind), eq(review.tmdbId, tmdbId)),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(review)
      .set({ body, containsSpoilers, updatedAt: now })
      .where(
        and(eq(review.userId, user.id), eq(review.kind, kind), eq(review.tmdbId, tmdbId)),
      );
  } else {
    await db.insert(review).values({
      id: crypto.randomUUID(),
      userId: user.id,
      kind,
      tmdbId,
      body,
      containsSpoilers,
      createdAt: now,
      updatedAt: now,
    });
  }
  await revalidatePaths(pathsForMedia(kind, tmdbId));
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
  await revalidatePaths(pathsForMedia(kind, tmdbId));
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
