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

/** Rows per page of the watched grid; matches the `getWatched` default. */
const PAGE_SIZE = 60;

/** `?page=N`, 1-based and digits only. Anything else falls back to page 1. */
function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  // Cap so a hand-edited URL cannot ask for an absurd offset.
  return Math.min(n, 1000);
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
  const page = parsePage(query.page);
  const [counts, watchedPage, lists, following] = await Promise.all([
    getFollowCounts(profile.id),
    getWatched(profile.id, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
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
            page > 1 ? (
              <p className="text-muted">
                No more titles.{" "}
                <a
                  className="text-accent hover:text-accent-hi"
                  href={`/u/${profile.id}`}
                >
                  Back to the first page
                </a>
              </p>
            ) : (
              <p className="text-muted">Nothing watched yet.</p>
            )
          ) : (
            <>
              {/* "Recently" is only accurate while the grid is the whole set;
                  once it is paged the heading must not imply a total. */}
              <PosterGrid
                heading={
                  page === 1 && !watchedPage.hasMore
                    ? "Recently watched"
                    : "Watched"
                }
                items={watched}
              />
              {(page > 1 || watchedPage.hasMore) && (
                <nav className="mt-6 flex items-center gap-4 text-sm">
                  {page > 1 && (
                    <a
                      className="text-accent hover:text-accent-hi"
                      href={
                        page - 1 <= 1
                          ? `/u/${profile.id}`
                          : `/u/${profile.id}?page=${page - 1}`
                      }
                    >
                      Newer
                    </a>
                  )}
                  <span className="text-muted">Page {page}</span>
                  {watchedPage.hasMore && (
                    <a
                      className="text-accent hover:text-accent-hi"
                      href={`/u/${profile.id}?page=${page + 1}`}
                    >
                      Older
                    </a>
                  )}
                </nav>
              )}
            </>
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
