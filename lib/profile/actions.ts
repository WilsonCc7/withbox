"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { user } from "@/db/schema";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/session";

async function requireUser() {
  const sessionUser = await currentUser();
  if (!sessionUser) redirect("/sign-in");
  return sessionUser;
}

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_KEY = (userId: string) => `avatars/${userId}`;

/** Name + bio edits. Validation failures return silently (no write). */
export async function updateProfile(formData: FormData): Promise<void> {
  const sessionUser = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 60) return;

  const bioRaw = String(formData.get("bio") ?? "").trim();
  if (bioRaw.length > 300) return;

  await getDb()
    .update(user)
    .set({ name, bio: bioRaw === "" ? null : bioRaw, updatedAt: new Date() })
    .where(eq(user.id, sessionUser.id));

  revalidatePath("/settings");
  revalidatePath(`/u/${sessionUser.id}`);
}

/** Replace the avatar object; one key per user, re-uploads overwrite. */
export async function uploadAvatar(formData: FormData): Promise<void> {
  const sessionUser = await requireUser();
  const bucket = env().AVATARS;
  if (!bucket) return;

  const file = formData.get("avatar");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 2_000_000 ||
    !AVATAR_TYPES.includes(file.type)
  ) {
    return;
  }

  await bucket.put(AVATAR_KEY(sessionUser.id), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const avatarUrl = `/api/avatar/${sessionUser.id}?v=${Date.now()}`;
  await getDb()
    .update(user)
    .set({ image: avatarUrl, updatedAt: new Date() })
    .where(eq(user.id, sessionUser.id));

  revalidatePath("/settings");
  revalidatePath(`/u/${sessionUser.id}`);
}

/** Clear the avatar; binding absent still clears the column. */
export async function removeAvatar(formData: FormData): Promise<void> {
  const sessionUser = await requireUser();
  const bucket = env().AVATARS;
  if (bucket) await bucket.delete(AVATAR_KEY(sessionUser.id));

  await getDb()
    .update(user)
    .set({ image: null, updatedAt: new Date() })
    .where(eq(user.id, sessionUser.id));

  revalidatePath("/settings");
  revalidatePath(`/u/${sessionUser.id}`);
}
