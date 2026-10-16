"use server";

import { and, asc, count, desc, eq, gt, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
// `follow` is also an exported server action in this file, so the table is
// aliased to keep the two apart.
import { follow as followTable, list, listItem } from "@/db/schema";
import type { MediaKind } from "@/lib/media/types";
import { currentUser } from "@/lib/session";
import { FOLLOW_LIMIT, LIST_LIMIT } from "@/lib/social/queries";

/**
 * Server actions. Every one takes `FormData` so a plain
 * `<form action={...}>` works with JavaScript disabled.
 *
 * Id generation and the requireUser/revalidatePaths helpers match
 * lib/library/actions.ts, so the codebase keeps one convention.
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

/**
 * Follow is idempotent: a double-submit finds the existing row
 * (the unique `follow_pair` index would otherwise throw) and
 * inserts nothing. A user can never follow themselves, and the
 * follow list is capped at FOLLOW_LIMIT because the feed binds it
 * into one `inArray` — D1 caps a statement at 100 parameters.
 * Every bail here is silent, like the other no-op guards.
 */
export async function follow(formData: FormData): Promise<void> {
 const user = await requireUser();
 const targetId = formData.get("userId");
 if (typeof targetId !== "string" || targetId === "") return;
 if (targetId === user.id) return;

 const db = getDb();
 const followingRows = await db
  .select({ following: count() })
  .from(followTable)
  .where(eq(followTable.followerId, user.id));
 if (followingRows[0].following >= FOLLOW_LIMIT) return;

 const existing = await db
  .select({ id: followTable.id })
  .from(followTable)
  .where(
   and(eq(followTable.followerId, user.id), eq(followTable.followingId, targetId)),
  )
  .limit(1);

 if (existing.length === 0) {
  await db
   .insert(followTable)
   .values({
    id: crypto.randomUUID(),
    followerId: user.id,
    followingId: targetId,
    createdAt: new Date(),
   })
   // Two overlapping submits can both see no row; the unique index then
   // rejects the loser, which is the outcome it wanted anyway.
   .onConflictDoNothing();
 }

 await revalidatePaths([`/u/${targetId}`, "/feed"]);
}

export async function unfollow(formData: FormData): Promise<void> {
 const user = await requireUser();
 const targetId = formData.get("userId");
 if (typeof targetId !== "string" || targetId === "") return;
 if (targetId === user.id) return;

 await getDb()
  .delete(followTable)
  .where(
   and(eq(followTable.followerId, user.id), eq(followTable.followingId, targetId)),
  );

 await revalidatePaths([`/u/${targetId}`, "/feed"]);
}

export async function createList(formData: FormData): Promise<void> {
 const user = await requireUser();
 const name = String(formData.get("name") ?? "").trim();
 if (name === "" || name.length > 80) return;
 const description = String(formData.get("description") ?? "").trim();
 if (description.length > 200) return;

 const db = getDb();
 // Same policy cap the actions enforce elsewhere: a user's lists are read
 // together, so the count is bounded rather than chunked.
 const listRows = await db
  .select({ lists: count() })
  .from(list)
  .where(eq(list.userId, user.id));
 if (listRows[0].lists >= LIST_LIMIT) return;

 await db.insert(list).values({
  id: crypto.randomUUID(),
  userId: user.id,
  name,
  description: description === "" ? null : description,
  createdAt: new Date(),
  updatedAt: new Date(),
 });

 await revalidatePaths(["/lists"]);
}

/** Only the owner may delete; cascade removes its items. */
export async function deleteList(formData: FormData): Promise<void> {
 const user = await requireUser();
 const listId = formData.get("listId");
 if (typeof listId !== "string" || listId === "") return;

 const db = getDb();
 const ownerRows = await db
  .select({ id: list.id })
  .from(list)
  .where(and(eq(list.id, listId), eq(list.userId, user.id)))
  .limit(1);
 if (ownerRows.length === 0) return;

 await db.delete(list).where(eq(list.id, listId));

 await revalidatePaths(["/lists", `/lists/${listId}`]);
}

/**
 * Owner-only and idempotent: the unique `list_item_media` index
 * would throw on a repeat add, so check first and return without
 * inserting. Position is (max existing position) + 1, or 0 when
 * the list is empty.
 */
export async function addToList(formData: FormData): Promise<void> {
 const user = await requireUser();
 const listId = formData.get("listId");
 if (typeof listId !== "string" || listId === "") return;
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));

 const db = getDb();

 const ownerRows = await db
  .select({ id: list.id })
  .from(list)
  .where(and(eq(list.id, listId), eq(list.userId, user.id)))
  .limit(1);
 if (ownerRows.length === 0) return;

 const existing = await db
  .select({ id: listItem.id })
  .from(listItem)
  .where(
   and(
    eq(listItem.listId, listId),
    eq(listItem.kind, kind),
    eq(listItem.tmdbId, tmdbId),
   ),
  )
  .limit(1);
 if (existing.length > 0) return;

 const maxRows = await db
  .select({ position: listItem.position })
  .from(listItem)
  .where(eq(listItem.listId, listId))
  .orderBy(desc(listItem.position))
  .limit(1);
 const position = (maxRows[0]?.position ?? -1) + 1;

 await db
  .insert(listItem)
  .values({
   id: crypto.randomUUID(),
   listId,
   kind,
   tmdbId,
   position,
   addedAt: new Date(),
  })
  // Overlapping submits both see no row; the unique index rejects the loser.
  .onConflictDoNothing();

 await revalidatePaths([`/lists/${listId}`]);
}

/** Owner-only removal. */
export async function removeFromList(formData: FormData): Promise<void> {
 const user = await requireUser();
 const listId = formData.get("listId");
 if (typeof listId !== "string" || listId === "") return;
 const kind = parseKind(formData.get("kind"));
 const tmdbId = parseTmdbId(formData.get("tmdbId"));

 const db = getDb();
 const ownerRows = await db
  .select({ id: list.id })
  .from(list)
  .where(and(eq(list.id, listId), eq(list.userId, user.id)))
  .limit(1);
 if (ownerRows.length === 0) return;

 await db
  .delete(listItem)
  .where(
   and(
    eq(listItem.listId, listId),
    eq(listItem.kind, kind),
    eq(listItem.tmdbId, tmdbId),
   ),
  );

 await revalidatePaths([`/lists/${listId}`]);
}

/**
 * Owner-only. An out-of-range name or description is rejected silently
 * rather than truncated: the form re-renders with the original text.
 * `updatedAt` is maintained by the column's `$onUpdate`.
 */
export async function renameList(formData: FormData): Promise<void> {
 const user = await requireUser();
 const listId = formData.get("listId");
 if (typeof listId !== "string" || listId === "") return;
 const name = String(formData.get("name") ?? "").trim();
 if (name === "" || name.length > 80) return;
 const description = String(formData.get("description") ?? "").trim();
 if (description.length > 200) return;

 const db = getDb();
 const ownerRows = await db
  .select({ id: list.id })
  .from(list)
  .where(and(eq(list.id, listId), eq(list.userId, user.id)))
  .limit(1);
 if (ownerRows.length === 0) return;

 await db
  .update(list)
  .set({ name, description: description === "" ? null : description })
  .where(eq(list.id, listId));

 await revalidatePaths(["/lists", `/lists/${listId}`]);
}

/**
 * Owner-only reorder: swap positions with the nearest neighbour in the same
 * direction. The two updates go through one `db.batch` for atomicity — there
 * is no unique index on `(listId, position)`, so a half-applied swap would
 * just be a wrong order, not a constraint error.
 */
export async function moveListItem(formData: FormData): Promise<void> {
 const user = await requireUser();
 const itemId = formData.get("itemId");
 if (typeof itemId !== "string" || itemId === "") return;
 const direction = formData.get("direction");
 if (direction !== "up" && direction !== "down") return;

 const db = getDb();
 // The join both proves ownership and yields the row's position, so this
 // costs one statement rather than a separate owner check.
 const currentRows = await db
  .select({ listId: listItem.listId, position: listItem.position })
  .from(listItem)
  .innerJoin(list, eq(listItem.listId, list.id))
  .where(and(eq(listItem.id, itemId), eq(list.userId, user.id)))
  .limit(1);
 if (currentRows.length === 0) return;
 const current = currentRows[0];

 const up = direction === "up";
 const neighbourRows = await db
  .select({ id: listItem.id, position: listItem.position })
  .from(listItem)
  .where(
   and(
    eq(listItem.listId, current.listId),
    up
     ? lt(listItem.position, current.position)
     : gt(listItem.position, current.position),
   ),
  )
  .orderBy(up ? desc(listItem.position) : asc(listItem.position))
  .limit(1);
 const neighbour = neighbourRows[0];
 if (!neighbour) return;

 await db.batch([
  db
   .update(listItem)
   .set({ position: neighbour.position })
   .where(eq(listItem.id, itemId)),
  db
   .update(listItem)
   .set({ position: current.position })
   .where(eq(listItem.id, neighbour.id)),
 ]);

 await revalidatePaths([`/lists/${current.listId}`]);
}
