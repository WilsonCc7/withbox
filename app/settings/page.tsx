import { SiteHeader } from "@/components/site-header";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { removeAvatar, updateProfile, uploadAvatar } from "@/lib/profile/actions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default async function SettingsPage() {
  const sessionUser = await currentUser();

  if (!sessionUser) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/settings">
              Sign in
            </a>{" "}
            to change your settings.
          </h1>
        </main>
      </>
    );
  }

  const [row] = await getDb()
    .select({ name: user.name, bio: user.bio, image: user.image })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);

  const name = row?.name ?? sessionUser.name;
  const bio = row?.bio ?? "";
  const image = row?.image;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-8 sm:px-6">
        <div className="flex items-center justify-between pt-8">
          <h1 className="text-2xl font-bold text-fg">Settings</h1>
          <a className="text-sm text-accent hover:text-accent-hi" href={`/u/${sessionUser.id}`}>
            View profile
          </a>
        </div>

        <section className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Avatar</h2>
          <div className="flex items-center gap-4">
            {image ? (
              <img className="h-16 w-16 rounded-full object-cover" alt="" src={image} />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-hi text-lg font-semibold text-muted">
                {initials(name)}
              </div>
            )}
            <form action={uploadAvatar} method="post" encType="multipart/form-data" className="flex items-center gap-2">
              <input
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp"
                required
                className="text-sm text-fg file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-hi file:px-2 file:py-1 file:text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg hover:border-accent"
              >
                Upload
              </button>
            </form>
          </div>
          <p className="text-xs text-faint">JPEG, PNG or WebP, up to 2 MB.</p>
          {image && (
            <form action={removeAvatar} method="post">
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-sm text-danger hover:border-danger"
              >
                Remove
              </button>
            </form>
          )}
        </section>

        <section className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Profile</h2>
          <form action={updateProfile} method="post" className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted">
              Name
              <input
                type="text"
                name="name"
                defaultValue={name}
                maxLength={60}
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Bio
              <textarea
                name="bio"
                defaultValue={bio}
                maxLength={300}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent"
              />
            </label>
            <p className="text-xs text-faint">300 characters max</p>
            <button
              type="submit"
              className="self-start rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg hover:border-accent"
            >
              Save
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
