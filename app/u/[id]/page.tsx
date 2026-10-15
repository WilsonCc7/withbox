import { FollowButton } from "@/components/social/follow-button";
import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { user } from "@/db/schema";
import {
  getFollowCounts,
  getListsByUser,
  isFollowing,
} from "@/lib/social/queries";
import { getWatched } from "@/lib/library/queries";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await currentUser();

  // Single lookup for the profile user; the social queries all
  // take explicit ids, so the page resolves the user itself.
  const [profile] = await getDb()
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  if (!profile) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            No such user.{" "}
            <a className="text-accent hover:text-accent-hi" href="/">
              Go home
            </a>
          </h1>
        </main>
      </>
    );
  }

  const isSelf = viewer?.id === profile.id;
  const [counts, watchedPage, lists, following] = await Promise.all([
    getFollowCounts(profile.id),
    getWatched(profile.id, { limit: 24 }),
    getListsByUser(profile.id),
    viewer && !isSelf
      ? isFollowing(viewer.id, profile.id)
      : Promise.resolve(false),
  ]);

  const source = mediaSource();
  const watched = (
    await Promise.all(
      watchedPage.rows.map(async ({ ref }) =>
        ref.kind === "movie"
          ? await source.movie(ref.tmdbId)
          : await source.tv(ref.tmdbId),
      ),
    )
  ).filter((item): item is MediaDetail => item !== null);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <header className="pb-6 pt-8">
          <h1 className="text-xl font-semibold">{profile.name}</h1>
          <p className="text-muted text-sm">
            <b>{counts.followers}</b> followers ·{" "}
            <b>{counts.following}</b> following
          </p>
          {!isSelf && (
            <div className="mt-3">
              <FollowButton
                targetId={profile.id}
                targetName={profile.name}
                isFollowing={following}
                signedIn={viewer !== null}
              />
            </div>
          )}
        </header>

        <section className="pb-8">
          {watched.length === 0 ? (
            <p className="text-muted">Nothing watched yet.</p>
          ) : (
            <PosterGrid heading="Recently watched" items={watched} />
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-fg">Lists</h2>
          {lists.length === 0 ? (
            <p className="text-muted">No lists yet.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {lists.map((list) => (
                <li key={list.id}>
                  <a
                    className="block px-4 py-3 text-sm text-fg hover:text-accent"
                    href={`/lists/${list.id}`}
                  >
                    {list.name}{" "}
                    <span className="text-muted">
                      · {list.itemCount} title
                      {list.itemCount === 1 ? "" : "s"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
