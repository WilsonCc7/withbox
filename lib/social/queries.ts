import {
 and,
 count,
 desc,
 eq,
 inArray,
 isNotNull,
 isNull,
 ne,
 or,
 sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
 follow,
 list,
 listItem,
 rating,
 review,
 user,
 watchEntry,
} from "@/db/schema";
import type { ActivityItem, ListSummary, UserSummary } from "./types";
import type { MediaRef } from "@/lib/library/types";

/**
 * Reads only. Everything takes the ids it needs explicitly — the
 * session is resolved in lib/session.ts and by the server actions,
 * never here.
 */

export async function isFollowing(
 followerId: string,
 followingId: string,
): Promise<boolean> {
 const rows = await getDb()
  .select({ id: follow.id })
  .from(follow)
  .where(
   and(
    eq(follow.followerId, followerId),
    eq(follow.followingId, followingId),
   ),
  )
  .limit(1);
 return rows.length > 0;
}

/** COUNT aggregates, not row fetches. */
export async function getFollowCounts(
 userId: string,
): Promise<{ followers: number; following: number }> {
 // Conditional COUNT aggregates: one scan of the relevant rows,
 // not two queries and not fetching rows to count in JS.
 // SQLite has no COUNT(*) FILTER — CASE inside count() is the
 // equivalent.
 const rows = await getDb()
  .select({
   followers: sql<number>`count(case when ${follow.followingId} = ${userId} then 1 end)`,
   following: sql<number>`count(case when ${follow.followerId} = ${userId} then 1 end)`,
  })
  .from(follow)
  .where(or(eq(follow.followingId, userId), eq(follow.followerId, userId)));
 const row = rows[0] ?? { followers: 0, following: 0 };
 return { followers: row.followers, following: row.following };
}

export async function getFollowers(
 userId: string,
 limit?: number,
): Promise<UserSummary[]> {
 const rows = await getDb()
  .select({ id: user.id, name: user.name })
  .from(follow)
  .innerJoin(user, eq(follow.followerId, user.id))
  .where(eq(follow.followingId, userId))
  .orderBy(desc(follow.createdAt))
  .limit(limit ?? 50);
 return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function getFollowing(
 userId: string,
 limit?: number,
): Promise<UserSummary[]> {
 const rows = await getDb()
  .select({ id: user.id, name: user.name })
  .from(follow)
  .innerJoin(user, eq(follow.followingId, user.id))
  .where(eq(follow.followerId, userId))
  .orderBy(desc(follow.createdAt))
  .limit(limit ?? 50);
 return rows.map((row) => ({ id: row.id, name: row.name }));
}

/**
 * The derived activity feed: the viewer plus everyone they follow,
 * merged from four sources in at most five queries (one to resolve
 * the follow scope, one per source — never per followed user).
 *
 * Timestamps come from each source row: `watchedAt` for watch
 * entries, `updatedAt` for ratings and reviews (the latest
 * meaningful edit), `createdAt` for lists.
 */
export async function getActivity(
 viewerId: string,
 limit?: number,
): Promise<ActivityItem[]> {
 const followed = await getDb()
  .select({ followingId: follow.followingId })
  .from(follow)
  .where(eq(follow.followerId, viewerId));
 const scope = [viewerId, ...followed.map((row) => row.followingId)];

 const [watches, ratings, reviews, lists] = await Promise.all([
  // Films (season IS NULL) and episode rows (episode IS NOT NULL).
  // By design there are no show/season-level rows, so this OR
  // admits every legitimate watch row and nothing else.
  getDb()
   .select({
    userId: watchEntry.userId,
    userName: user.name,
    at: watchEntry.watchedAt,
    kind: watchEntry.kind,
    tmdbId: watchEntry.tmdbId,
    season: watchEntry.season,
    episode: watchEntry.episode,
   })
   .from(watchEntry)
   .innerJoin(user, eq(watchEntry.userId, user.id))
   .where(
    and(
     inArray(watchEntry.userId, scope),
     or(isNull(watchEntry.season), isNotNull(watchEntry.episode)),
    ),
   )
   .orderBy(desc(watchEntry.watchedAt))
   .limit(limit ?? 30),
  getDb()
   .select({
    userId: rating.userId,
    userName: user.name,
    at: rating.updatedAt,
    kind: rating.kind,
    tmdbId: rating.tmdbId,
    value: rating.value,
   })
   .from(rating)
   .innerJoin(user, eq(rating.userId, user.id))
   .where(inArray(rating.userId, scope))
   .orderBy(desc(rating.updatedAt))
   .limit(limit ?? 30),
  getDb()
   .select({
    userId: review.userId,
    userName: user.name,
    at: review.updatedAt,
    kind: review.kind,
    tmdbId: review.tmdbId,
    body: review.body,
    containsSpoilers: review.containsSpoilers,
   })
   .from(review)
   .innerJoin(user, eq(review.userId, user.id))
   .where(inArray(review.userId, scope))
   .orderBy(desc(review.updatedAt))
   .limit(limit ?? 30),
  getDb()
   .select({
    userId: list.userId,
    userName: user.name,
    at: list.createdAt,
    id: list.id,
    name: list.name,
   })
   .from(list)
   .innerJoin(user, eq(list.userId, user.id))
   .where(inArray(list.userId, scope))
   .orderBy(desc(list.createdAt))
   .limit(limit ?? 30),
 ]);

 const items: ActivityItem[] = [
  ...watches.map((row) => ({
   type: "watch" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
   season: row.season,
   episode: row.episode,
  })),
  ...ratings.map((row) => ({
   type: "rating" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
   value: row.value,
  })),
  ...reviews.map((row) => ({
   type: "review" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
   body: row.body,
   containsSpoilers: row.containsSpoilers,
  })),
  ...lists.map((row) => ({
   type: "listed" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   listId: row.id,
   listName: row.name,
  })),
 ];

 items.sort((a, b) => b.at.getTime() - a.at.getTime());
 return items.slice(0, limit ?? 30);
}

/** Each list with its item count via a COUNT, not a per-list query. */
export async function getListsByUser(
 userId: string,
): Promise<ListSummary[]> {
 const rows = await getDb()
  .select({
   id: list.id,
   name: list.name,
   description: list.description,
   ownerId: user.id,
   ownerName: user.name,
   itemCount: count(listItem.id),
   updatedAt: list.updatedAt,
  })
  .from(list)
  .innerJoin(user, eq(list.userId, user.id))
  .leftJoin(listItem, eq(listItem.listId, list.id))
  .where(eq(list.userId, userId))
  .groupBy(list.id)
  .orderBy(desc(list.updatedAt));
 return rows.map((row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  owner: { id: row.ownerId, name: row.ownerName },
  itemCount: row.itemCount,
  updatedAt: row.updatedAt,
 }));
}

export async function getListById(
 listId: string,
): Promise<(ListSummary & { items: MediaRef[] }) | null> {
 const rows = await getDb()
  .select({
   id: list.id,
   name: list.name,
   description: list.description,
   ownerId: user.id,
   ownerName: user.name,
   updatedAt: list.updatedAt,
  })
  .from(list)
  .innerJoin(user, eq(list.userId, user.id))
  .where(eq(list.id, listId))
  .limit(1);
 if (rows.length === 0) return null;

 const items = await getDb()
  .select({ kind: listItem.kind, tmdbId: listItem.tmdbId })
  .from(listItem)
  .where(eq(listItem.listId, listId))
  .orderBy(listItem.position);

 const row = rows[0];
 return {
  id: row.id,
  name: row.name,
  description: row.description,
  owner: { id: row.ownerId, name: row.ownerName },
  itemCount: items.length,
  updatedAt: row.updatedAt,
  items: items.map(
   (item) => ({ kind: item.kind, tmdbId: item.tmdbId }) satisfies MediaRef,
  ),
 };
}

export async function isListOwner(
 listId: string,
 userId: string,
): Promise<boolean> {
 const rows = await getDb()
  .select({ id: list.id })
  .from(list)
  .where(and(eq(list.id, listId), eq(list.userId, userId)))
  .limit(1);
 return rows.length > 0;
}
/**
 * Every account except the viewer, ordered by name — the
 * "people to follow" directory. Explicit ids only, like the
 * other reads; follow state is the caller's job via isFollowing.
 */
export async function listUsers(
 viewerId: string,
 limit?: number,
): Promise<UserSummary[]> {
 const rows = await getDb()
  .select({ id: user.id, name: user.name })
  .from(user)
  .where(ne(user.id, viewerId))
  .orderBy(user.name)
  .limit(limit ?? 50);
 return rows.map((row) => ({ id: row.id, name: row.name }));
}
