"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
// `follow` is also an exported server action in this file, so the table is
// aliased to keep the two apart.
import { follow as followTable, list, listItem } from "@/db/schema";
import type { MediaKind } from "@/lib/media/types";
import { currentUser } from "@/lib/session";

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
 * inserts nothing. A user can never follow themselves — bail
 * silently, like the other no-op guards in this file.
 */
export async function follow(formData: FormData): Promise<void> {
 const user = await requireUser();
 const targetId = formData.get("userId");
 if (typeof targetId !== "string" || targetId === "") return;
 if (targetId === user.id) return;

 const db = getDb();
 const existing = await db
  .select({ id: followTable.id })
  .from(followTable)
  .where(
   and(eq(followTable.followerId, user.id), eq(followTable.followingId, targetId)),
  )
  .limit(1);

 if (existing.length === 0) {
  await db.insert(followTable).values({
   id: crypto.randomUUID(),
   followerId: user.id,
   followingId: targetId,
   createdAt: new Date(),
  });
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
 if (name === "") return;
 const description = String(formData.get("description") ?? "").trim();

 await getDb().insert(list).values({
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

 await db.insert(listItem).values({
  id: crypto.randomUUID(),
  listId,
  kind,
  tmdbId,
  position,
  addedAt: new Date(),
 });

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
