import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Better Auth tables for SQLite/D1.
 *
 * Column names are camelCase (`emailVerified`, `createdAt`,
 * `userId`, ...) — the convention Better Auth's kysely adapter
 * uses by default. This project reaches D1 through Better
 * Auth's built-in kysely `D1SqliteDialect` (the `database`
 * option accepts a raw D1 binding), so the physical columns
 * must match what that adapter reads and writes.
 *
 * SQLite has no standalone `boolean` column type in drizzle;
 * booleans are `integer(..., { mode: "boolean" })`, and
 * timestamps are `integer(..., { mode: "timestamp_ms" })`
 * (milliseconds).
 *
 * Better Auth's `getSchema()` reports every field as
 * `index: false`; the per-field secondary indexes below back
 * the session-lookup and account-lookup queries the adapter
 * runs on every request, and SQLite does not auto-index
 * foreign keys.
 */

export const user = sqliteTable("user", {
 id: text("id").primaryKey(),
 name: text("name").notNull(),
 email: text("email").notNull().unique(),
 emailVerified: integer("emailVerified", { mode: "boolean" })
  .notNull()
  .default(false),
 image: text("image"),
 /** Profile bio. Declared to Better Auth via `user.additionalFields`. */
 bio: text("bio"),
 createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
 updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
  .notNull()
  .$onUpdate(() => new Date()),
});

export const session = sqliteTable(
 "session",
 {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
 },
 (table) => [index("session_user_id_index").on(table.userId)],
);

export const account = sqliteTable(
 "account",
 {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", {
   mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
   mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
 },
 (table) => [index("account_user_id_index").on(table.userId)],
);

export const verification = sqliteTable(
 "verification",
 {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
 },
 (table) => [index("verification_identifier_index").on(table.identifier)],
);

/**
 * Domain tables.
 *
 * Same camelCase convention as the Better Auth tables above, so the database
 * has one naming style.
 *
 * Modelling notes:
 *
 * - A film is `(kind: "movie", tmdbId, season: null, episode: null)`.
 * - A series episode is `(kind: "tv", tmdbId, season, episode)`.
 * - There is deliberately **no** series-level or season-level row. Marking a
 *   whole show or season is a batch insert of episode rows, and show/season
 *   progress is derived with COUNT at query time. A stored counter is a bug
 *   waiting for a delete.
 * - `watch_entry` allows repeated rows for the same key, so rewatches are
 *   representable. "Have I watched this" is an EXISTS check; toggling off
 *   deletes every row for that key.
 */

export const watchEntry = sqliteTable(
 "watch_entry",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  season: integer("season"),
  episode: integer("episode"),
  /**
   * True when this entry is a repeat viewing. Repeated rows for one key were
   * already allowed (that is how rewatches were represented); this flag makes
   * the *first* viewing distinguishable from the later ones in the diary.
   */
  rewatch: integer("rewatch", { mode: "boolean" }).notNull().default(false),
  watchedAt: integer("watchedAt", { mode: "timestamp_ms" }).notNull(),
 },
 (table) => [
  index("watch_entry_user_media").on(table.userId, table.kind, table.tmdbId),
  index("watch_entry_user_episode").on(
   table.userId,
   table.kind,
   table.tmdbId,
   table.season,
   table.episode,
  ),
  index("watch_entry_user_watched_at").on(table.userId, table.watchedAt),
 ],
);

export const rating = sqliteTable(
 "rating",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  /**
   * Half-stars, 1..10 — 7 is three and a half stars. Integers avoid float
   * rounding when averaging, and sort correctly.
   */
  value: integer("value").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
 },
 (table) => [
  uniqueIndex("rating_user_media").on(table.userId, table.kind, table.tmdbId),
 ],
);

export const review = sqliteTable(
 "review",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  body: text("body").notNull(),
  containsSpoilers: integer("containsSpoilers", { mode: "boolean" })
   .notNull()
   .default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
 },
 (table) => [
  uniqueIndex("review_user_media").on(table.userId, table.kind, table.tmdbId),
 ],
);

export const watchlistItem = sqliteTable(
 "watchlist_item",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  addedAt: integer("addedAt", { mode: "timestamp_ms" }).notNull(),
 },
 (table) => [
  uniqueIndex("watchlist_user_media").on(table.userId, table.kind, table.tmdbId),
  index("watchlist_user_added").on(table.userId, table.addedAt),
 ],
);

/**
 * A heart on a title. Distinct from `rating` (a score) and `watchlist_item`
 * (an intent to watch): "liked" is the Letterboxd-style signal that survives
 * after the score is forgotten.
 *
 * Table name is `media_like` because `LIKE` is a SQL keyword; the JS symbol
 * stays `mediaLike`.
 */
export const mediaLike = sqliteTable(
 "media_like",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
 },
 (table) => [
  uniqueIndex("media_like_user_media").on(table.userId, table.kind, table.tmdbId),
  index("media_like_user_created").on(table.userId, table.createdAt),
 ],
);

/**
 * Up to four favourites per user, pinned to fixed slots (`position` 0..3) so
 * the profile grid never reflows when one is cleared.
 *
 * `favorite_user_position` is what makes the slot assignment deterministic:
 * assigning a title to an occupied slot requires clearing it in the same
 * statement batch, so a duplicate slot can never be stored.
 */
export const favorite = sqliteTable(
 "favorite",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  position: integer("position").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
 },
 (table) => [
  uniqueIndex("favorite_user_media").on(table.userId, table.kind, table.tmdbId),
  uniqueIndex("favorite_user_position").on(table.userId, table.position),
 ],
);

export const playbackProgress = sqliteTable(
 "playback_progress",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  season: integer("season"),
  episode: integer("episode"),
  slotKey: text("slotKey").notNull(),
  positionSeconds: integer("positionSeconds").notNull(),
  durationSeconds: integer("durationSeconds"),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
 },
 (table) => [
  uniqueIndex("playback_progress_slot").on(table.userId, table.slotKey),
  index("playback_progress_user_index").on(table.userId),
 ],
);
/**
 * Social tables.
 *
 * `follow` is a directed edge: `followerId` follows `followingId`.
 * The unique pair index makes follow idempotent (a double-submit
 * finds the row, not a constraint error); the reverse index backs
 * "who follows me" lookups, which the pair index alone cannot
 * serve.
 *
 * The activity feed is derived from `watch_entry`, `rating`,
 * `review` and `list` rows at read time — there is deliberately
 * no stored event log (a second copy of the truth to drift).
 */
export const follow = sqliteTable(
 "follow",
 {
  id: text("id").primaryKey(),
  followerId: text("followerId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  followingId: text("followingId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
 },
 (table) => [
  uniqueIndex("follow_pair").on(table.followerId, table.followingId),
  index("follow_following_index").on(table.followingId),
 ],
);

export const list = sqliteTable(
 "list",
 {
  id: text("id").primaryKey(),
  userId: text("userId")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
   .notNull()
   .$onUpdate(() => new Date()),
 },
 (table) => [index("list_user_index").on(table.userId)],
);

export const listItem = sqliteTable(
 "list_item",
 {
  id: text("id").primaryKey(),
  listId: text("listId")
   .notNull()
   .references(() => list.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["movie", "tv"] }).notNull(),
  tmdbId: integer("tmdbId").notNull(),
  position: integer("position").notNull(),
  addedAt: integer("addedAt", { mode: "timestamp_ms" }).notNull(),
 },
 (table) => [
  uniqueIndex("list_item_media").on(table.listId, table.kind, table.tmdbId),
  index("list_item_list_index").on(table.listId),
 ],
);
export const schema = {
 user,
 session,
 account,
 verification,
 watchEntry,
 rating,
 review,
 watchlistItem,
 mediaLike,
 favorite,
 follow,
 playbackProgress,
 list,
 listItem,
};
