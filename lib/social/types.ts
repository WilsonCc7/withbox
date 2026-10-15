import type { MediaRef } from "@/lib/library/types";

export interface UserSummary {
 id: string;
 name: string;
}

export interface ListSummary {
 id: string;
 name: string;
 description: string | null;
 owner: UserSummary;
 itemCount: number;
 updatedAt: Date;
}

/**
 * Fields every activity row carries.
 *
 * `id` is the source row's id. It is the React key, and — because a bulk
 * season mark can write many watch rows with an identical `watchedAt` — it is
 * also the tiebreaker in the pagination cursor. Cursoring on `at` alone would
 * skip rows when a page boundary falls inside such a group.
 */
interface ActivityItemBase {
 id: string;
 user: UserSummary;
 at: Date;
}

/** One row of the activity feed. A discriminated union, not a nullable bag. */
export type ActivityItem =
 | (ActivityItemBase & {
  type: "watch";
  media: MediaRef;
  season: number | null;
  episode: number | null;
 })
 | (ActivityItemBase & {
  type: "rating";
  media: MediaRef;
  value: number;
 })
 | (ActivityItemBase & {
  type: "review";
  media: MediaRef;
  body: string;
  containsSpoilers: boolean;
 })
 | (ActivityItemBase & {
  type: "listed";
  listId: string;
  listName: string;
 });

/**
 * Keyset cursor: the `(at, id)` of the last row on the previous page. Keyset
 * rather than an offset because new activity arrives at the *head* of the
 * feed — an offset window would slide and repeat or skip rows between loads.
 */
export interface ActivityCursor {
 at: Date;
 id: string;
}

export interface ActivityPage {
 items: ActivityItem[];
 /** `null` when this is the last page. */
 next: ActivityCursor | null;
}
