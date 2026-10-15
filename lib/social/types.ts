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

/** One row of the activity feed. A discriminated union, not a nullable bag. */
export type ActivityItem =
  | {
      type: "watch";
      user: UserSummary;
      at: Date;
      media: MediaRef;
      season: number | null;
      episode: number | null;
    }
  | {
      type: "rating";
      user: UserSummary;
      at: Date;
      media: MediaRef;
      value: number;
    }
  | {
      type: "review";
      user: UserSummary;
      at: Date;
      media: MediaRef;
      body: string;
      containsSpoilers: boolean;
    }
  | {
      type: "listed";
      user: UserSummary;
      at: Date;
      listId: string;
      listName: string;
    };
