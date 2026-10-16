import type { MediaKind } from "@/lib/media/types";
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
 /** Cover thumb: the item at the list's minimum position; null when empty. */
 firstItem: MediaRef | null;
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
  rewatch: boolean;
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
  type: "liked";
  media: MediaRef;
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

/** One review with the author's title-level score, or null when unrated. */
export interface ReviewWithRef {
 kind: MediaKind;
 tmdbId: number;
 value: number | null;
 body: string;
 containsSpoilers: boolean;
 updatedAt: Date;
}

/**
 * Feed cursor wire format: `<epochMillis>-<rowId>`. Split on the FIRST
 * hyphen only — row ids are UUIDs and contain hyphens of their own, so a
 * plain split would tear them apart. Anything malformed means "first
 * page", never an error.
 */
export function parseActivityCursor(
 raw: string | null | undefined,
): { at: number; id: string } | null {
 if (raw === null || raw === undefined) return null;
 const split = raw.indexOf("-");
 if (split <= 0) return null;
 const at = Number.parseInt(raw.slice(0, split), 10);
 const id = raw.slice(split + 1);
 if (!Number.isFinite(at) || at < 0 || id === "") return null;
 return { at, id };
}
