import {
 type AnyColumn,
 and,
 count,
 desc,
 eq,
 inArray,
 isNotNull,
 isNull,
 lt,
 ne,
 or,
 sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
 follow,
 list,
 listItem,
 mediaLike,
 rating,
 review,
 user,
 watchEntry,
} from "@/db/schema";
import type {
 ActivityCursor,
 ActivityItem,
 ActivityPage,
 ListSummary,
 ReviewWithRef,
 UserSummary,
} from "./types";
import type { MediaRef } from "@/lib/library/types";
import type { MediaKind } from "@/lib/media/types";

// Co-located with the query that returns it: the profile/reviews pages import
// `getReviewsByUser` from here, so the type it returns lives here too.
export type { ReviewWithRef };

/**
 * Keyset predicate for a `(timestamp, id)` cursor: strictly older rows, with
 * the row id breaking ties. Inlined per source because each pair of columns is
 * a different Drizzle type.
 */
function olderThan(
 at: AnyColumn,
 id: AnyColumn,
 cursor: ActivityCursor,
) {
 return or(
  lt(at, cursor.at),
  and(eq(at, cursor.at), lt(id, cursor.id)),
 );
}

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
 * merged from five sources in at most six queries (one to resolve
 * the follow scope, one per source — never per followed user).
 *
 * Timestamps come from each source row: `watchedAt` for watch
 * entries, `updatedAt` for ratings and reviews (the latest
 * meaningful edit), `createdAt` for lists and likes.
 */
export async function getActivity(
 viewerId: string,
 options: { limit?: number; before?: ActivityCursor } = {},
): Promise<ActivityPage> {
 const limit = options.limit ?? 30;
 const before = options.before;
 // One row beyond the page: enough to prove a further page exists without a
 // COUNT or an extra round trip.
 const fetchLimit = limit + 1;
 const followed = await getDb()
  .select({ followingId: follow.followingId })
  .from(follow)
  .where(eq(follow.followerId, viewerId));
 const scope = [viewerId, ...followed.map((row) => row.followingId)];

 const [watches, ratings, reviews, lists, likes] = await Promise.all([
  // Films (season IS NULL) and episode rows (episode IS NOT NULL).
  // By design there are no show/season-level rows, so this OR
  // admits every legitimate watch row and nothing else.
  getDb()
   .select({
    id: watchEntry.id,
    userId: watchEntry.userId,
    userName: user.name,
    at: watchEntry.watchedAt,
    kind: watchEntry.kind,
    tmdbId: watchEntry.tmdbId,
    season: watchEntry.season,
    episode: watchEntry.episode,
    rewatch: watchEntry.rewatch,
   })
   .from(watchEntry)
   .innerJoin(user, eq(watchEntry.userId, user.id))
   .where(
    and(
     inArray(watchEntry.userId, scope),
     or(isNull(watchEntry.season), isNotNull(watchEntry.episode)),
     before ? olderThan(watchEntry.watchedAt, watchEntry.id, before) : undefined,
    ),
   )
   .orderBy(desc(watchEntry.watchedAt), desc(watchEntry.id))
   .limit(fetchLimit),
  getDb()
   .select({
    id: rating.id,
    userId: rating.userId,
    userName: user.name,
    at: rating.updatedAt,
    kind: rating.kind,
    tmdbId: rating.tmdbId,
    value: rating.value,
   })
   .from(rating)
   .innerJoin(user, eq(rating.userId, user.id))
   .where(
    and(
     inArray(rating.userId, scope),
     before ? olderThan(rating.updatedAt, rating.id, before) : undefined,
    ),
   )
   .orderBy(desc(rating.updatedAt), desc(rating.id))
   .limit(fetchLimit),
  getDb()
   .select({
    id: review.id,
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
   .where(
    and(
     inArray(review.userId, scope),
     before ? olderThan(review.updatedAt, review.id, before) : undefined,
    ),
   )
   .orderBy(desc(review.updatedAt), desc(review.id))
   .limit(fetchLimit),
  getDb()
   .select({
    id: list.id,
    userId: list.userId,
    userName: user.name,
    at: list.createdAt,
    name: list.name,
   })
   .from(list)
   .innerJoin(user, eq(list.userId, user.id))
   .where(
    and(
     inArray(list.userId, scope),
     before ? olderThan(list.createdAt, list.id, before) : undefined,
    ),
   )
   .orderBy(desc(list.createdAt), desc(list.id))
   .limit(fetchLimit),
  getDb()
   .select({
    id: mediaLike.id,
    userId: mediaLike.userId,
    userName: user.name,
    at: mediaLike.createdAt,
    kind: mediaLike.kind,
    tmdbId: mediaLike.tmdbId,
   })
   .from(mediaLike)
   .innerJoin(user, eq(mediaLike.userId, user.id))
   .where(
    and(
     inArray(mediaLike.userId, scope),
     before ? olderThan(mediaLike.createdAt, mediaLike.id, before) : undefined,
    ),
   )
   .orderBy(desc(mediaLike.createdAt), desc(mediaLike.id))
   .limit(fetchLimit),
 ]);

 const items: ActivityItem[] = [
  ...watches.map((row) => ({
   id: row.id,
   type: "watch" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
   season: row.season,
   episode: row.episode,
   rewatch: row.rewatch,
  })),
  ...ratings.map((row) => ({
   id: row.id,
   type: "rating" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
   value: row.value,
  })),
  ...reviews.map((row) => ({
   id: row.id,
   type: "review" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
   body: row.body,
   containsSpoilers: row.containsSpoilers,
  })),
  ...lists.map((row) => ({
   id: row.id,
   type: "listed" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   listId: row.id,
   listName: row.name,
  })),
  ...likes.map((row) => ({
   id: row.id,
   type: "liked" as const,
   user: { id: row.userId, name: row.userName },
   at: row.at,
   media: { kind: row.kind, tmdbId: row.tmdbId } satisfies MediaRef,
  })),
 ];

 // Mirrors the SQL ordering exactly: timestamp descending, then id descending.
 // The cursor predicate tests the same pair, so a page boundary can never skip
 // a row that shares a timestamp with the last row of the previous page —
 // which is exactly what a bulk season mark produces.
 items.sort(
  (a, b) =>
   b.at.getTime() - a.at.getTime() ||
   (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
 );

 const page = items.slice(0, limit);
 const last = page[page.length - 1];
 return {
  items: page,
  // `items.length > limit` can only happen because a source returned the
  // extra row, so this proves a further page exists without a COUNT.
  next: items.length > limit && last ? { at: last.at, id: last.id } : null,
 };
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

 // One statement for the whole page: the cover thumb of each list is the
 // item at that list's minimum position.
 const listIds = rows.map((row) => row.id);
 const firstItems: { listId: string; kind: MediaKind; tmdbId: number }[] =
  listIds.length === 0
   ? []
   : await getDb()
    .select({
     listId: listItem.listId,
     kind: listItem.kind,
     tmdbId: listItem.tmdbId,
    })
    .from(listItem)
    .where(
     and(
      inArray(listItem.listId, listIds),
      sql`${listItem.position} = (select min(i2.position) from list_item i2 where i2.listId = ${listItem.listId})`,
     ),
    )
    // Two items can share the minimum position; the id makes the pick
    // stable across loads instead of whatever the planner returns.
    .orderBy(listItem.id);
 const firstByList = Object.fromEntries(
  firstItems.map(
   (item): [string, MediaRef] => [
    item.listId,
    { kind: item.kind, tmdbId: item.tmdbId },
   ],
  ),
 );

 return rows.map((row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  owner: { id: row.ownerId, name: row.ownerName },
  itemCount: row.itemCount,
  updatedAt: row.updatedAt,
  firstItem: firstByList[row.id] ?? null,
 }));
}

/**
 * The item rows keep their own `id` alongside the media ref: the reorder and
 * remove controls key off `list_item.id`, and only this query has it.
 */
export async function getListById(
 listId: string,
): Promise<(ListSummary & { items: (MediaRef & { id: string })[] }) | null> {
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
  .select({
   id: listItem.id,
   kind: listItem.kind,
   tmdbId: listItem.tmdbId,
  })
  .from(listItem)
  .where(eq(listItem.listId, listId))
  .orderBy(listItem.position);

 const refs = items.map(
  (item) => ({ id: item.id, kind: item.kind, tmdbId: item.tmdbId }),
 );
 const row = rows[0];
 return {
  id: row.id,
  name: row.name,
  description: row.description,
  owner: { id: row.ownerId, name: row.ownerName },
  itemCount: refs.length,
  updatedAt: row.updatedAt,
  firstItem: refs[0] ?? null,
  items: refs,
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
 *
 * Offset-paginated rather than keyset: the order is a name, which the user can
 * change, so a name cursor would be unstable anyway; and the directory has no
 * natural "newest first" head that shifts between loads. `user.id` is the
 * secondary sort so the order is total and paging cannot repeat a row.
 */
export async function listUsers(
 viewerId: string,
 options: { limit?: number; offset?: number } = {},
): Promise<{ users: UserSummary[]; hasMore: boolean }> {
 const limit = options.limit ?? 50;
 const rows = await getDb()
  .select({ id: user.id, name: user.name })
  .from(user)
  .where(ne(user.id, viewerId))
  .orderBy(user.name, user.id)
  .limit(limit + 1)
  .offset(options.offset ?? 0);
 // The extra row is the proof of a further page; it is not returned.
 return {
  users: rows.slice(0, limit).map((row) => ({ id: row.id, name: row.name })),
  hasMore: rows.length > limit,
 };
}

/**
 * A user's reviews, newest edit first, each carrying the title-level score.
 * LEFT JOIN, not inner: a review can exist with no rating, and its `value`
 * must read as null rather than dropping the row. Offset-paginated like
 * `listUsers` — `updatedAt` is editable, so a keyset cursor on it would slide.
 */
export async function getReviewsByUser(
 userId: string,
 opts: { limit: number; offset: number },
): Promise<{ items: ReviewWithRef[]; hasMore: boolean }> {
 const rows = await getDb()
  .select({
   kind: review.kind,
   tmdbId: review.tmdbId,
   value: rating.value,
   body: review.body,
   containsSpoilers: review.containsSpoilers,
   updatedAt: review.updatedAt,
  })
  .from(review)
  .leftJoin(
   rating,
   and(
    eq(rating.userId, review.userId),
    eq(rating.kind, review.kind),
    eq(rating.tmdbId, review.tmdbId),
   ),
  )
  .where(eq(review.userId, userId))
  .orderBy(desc(review.updatedAt), desc(review.id))
  .limit(opts.limit + 1)
  .offset(opts.offset);
 // The extra row is the proof of a further page; it is not returned.
 return {
  items: rows.slice(0, opts.limit),
  hasMore: rows.length > opts.limit,
 };
}
