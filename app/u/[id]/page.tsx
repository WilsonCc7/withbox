import { FollowButton } from "@/components/social/follow-button";
import { PosterGrid } from "@/components/poster-grid";
import { DiaryRow } from "@/components/diary-row";
import { SiteHeader } from "@/components/site-header";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { user } from "@/db/schema";
import {
  getFollowCounts,
  getListsByUser,
  getReviewsByUser,
  isFollowing,
} from "@/lib/social/queries";
import { deleteWatchEntry, setFavorite } from "@/lib/library/actions";
import {
  getDiary,
  getFavorites,
  getLikedTitles,
  getProfileStats,
  getWatched,
  getWatchStates,
  type ProfileStats,
} from "@/lib/library/queries";
import { mediaKey, type MediaRef } from "@/lib/library/types";
import { imageUrl } from "@/lib/media/images";
import type { MediaDetail, MediaKind } from "@/lib/media/types";
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

function detailHref(kind: MediaKind, tmdbId: number): string {
  return kind === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
}

/** Star glyphs for `n` half-stars: 7 → "★★★½☆" (mirrors DiaryRow). */
function stars(n: number): string {
  const filled = Math.floor(n / 2);
  const half = n % 2 === 1;
  return "★".repeat(filled) + (half ? "½" : "") + "☆".repeat(5 - filled - (half ? 1 : 0));
}

/** One stats line; zero-valued clauses drop, except an all-zero
    profile still gets a line. */
function statsLine(stats: ProfileStats, followers: number, following: number): string {
  const clauses: string[] = [];
  const push = (n: number, one: string, many?: string): void => {
    if (n > 0) clauses.push(`${n} ${n === 1 ? one : (many ?? `${one}s`)}`);
  };
  push(stats.watchedMovies, "film");
  push(stats.watchedSeries, "series", "series");
  push(stats.watchEntries, "diary entry", "diary entries");
  push(stats.likes, "like");
  push(followers, "follower");
  push(following, "following");
  return clauses.length > 0 ? clauses.join(" · ") : "Nothing here yet.";
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
    .select({ id: user.id, name: user.name, bio: user.bio, image: user.image })
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
  const [counts, stats, watchedPage, lists, following, favorites, likedRefs, diaryPage, recentReviews] =
    await Promise.all([
      getFollowCounts(profile.id),
      getProfileStats(profile.id),
      getWatched(profile.id, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      getListsByUser(profile.id),
      viewer && !isSelf
        ? isFollowing(viewer.id, profile.id)
        : Promise.resolve(false),
      getFavorites(profile.id),
      getLikedTitles(profile.id, { limit: 12 }),
      getDiary(profile.id, { limit: 5, offset: 0 }),
      getReviewsByUser(profile.id, { limit: 3, offset: 0 }),
    ]);

  const source = mediaSource();
  async function resolve(ref: MediaRef): Promise<MediaDetail | null> {
    return ref.kind === "movie" ? source.movie(ref.tmdbId) : source.tv(ref.tmdbId);
  }

  const watched = (
    await Promise.all(watchedPage.rows.map(({ ref }) => resolve(ref)))
  ).filter((item): item is MediaDetail => item !== null);

  const liked = (
    await Promise.all(likedRefs.map((ref) => resolve(ref)))
  ).filter((item): item is MediaDetail => item !== null);

  // Favorites stay slot-aligned with `getFavorites` (always length 4);
  // a null is an empty slot, a failed lookup falls back to one.
  const favoriteItems = await Promise.all(
    favorites.map((ref) => (ref ? resolve(ref) : Promise.resolve(null))),
  );

  // Diary details stay index-aligned with the entries; ratings come
  // from one batched call over the page's refs.
  const diaryDetails = await Promise.all(
    diaryPage.items.map((entry) => resolve({ kind: entry.kind, tmdbId: entry.tmdbId })),
  );
  const diaryStates = await getWatchStates(
    profile.id,
    diaryPage.items.map((entry) => ({ kind: entry.kind, tmdbId: entry.tmdbId })),
  );

  const reviewDetails = await Promise.all(
    recentReviews.items.map((item) => resolve({ kind: item.kind, tmdbId: item.tmdbId })),
  );

  const initials = profile.name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <header className="pb-6 pt-8">
          <div className="flex items-center gap-4">
            {profile.image ? (
              <img
                alt=""
                className="h-16 w-16 rounded-full object-cover"
                src={profile.image}
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-hi text-lg font-semibold text-muted"
              >
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{profile.name}</h1>
              {profile.bio && <p className="mt-1 text-sm text-muted">{profile.bio}</p>}
              {isSelf && (
                <a
                  className="mt-1 inline-block text-sm text-accent hover:text-accent-hi"
                  href="/settings"
                >
                  Edit profile
                </a>
              )}
            </div>
          </div>
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

        <p className="pb-6 text-sm text-muted">
          {statsLine(stats, counts.followers, counts.following)}
        </p>

        <section className="pb-8">
          <h2 className="mb-4 text-xl font-semibold text-fg">Favorites</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {favorites.map((ref, slot) => {
              const item = ref ? (favoriteItems[slot] ?? null) : null;
              // Empty slots keep a dashed box so the row never collapses.
              if (!ref || !item) {
                return (
                  <li
                    key={slot}
                    aria-hidden="true"
                    className="aspect-[2/3] rounded-[var(--radius-card)] border border-dashed border-border bg-surface"
                  />
                );
              }
              const href = detailHref(ref.kind, ref.tmdbId);
              const poster = imageUrl(item.posterPath, "w185");
              return (
                <li key={slot}>
                  <a className="block" href={href}>
                    {poster ? (
                      <img
                        alt={`${item.title} poster`}
                        className="aspect-[2/3] w-full rounded-[var(--radius-card)] border border-border object-cover"
                        loading="lazy"
                        src={poster}
                      />
                    ) : (
                      <div className="aspect-[2/3] w-full rounded-[var(--radius-card)] border border-border bg-surface-hi" />
                    )}
                    <p className="mt-1 truncate text-xs text-fg">{item.title}</p>
                  </a>
                  {/* Re-posting the pinned title unpins it — the delete path. */}
                  {isSelf && (
                    <form action={setFavorite} method="post">
                      <input name="kind" type="hidden" value={ref.kind} />
                      <input name="tmdbId" type="hidden" value={ref.tmdbId} />
                      <input name="slot" type="hidden" value={slot} />
                      <button
                        className="mt-1 text-xs text-faint hover:text-danger"
                        type="submit"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {liked.length > 0 && (
          <section className="pb-8">
            <PosterGrid heading="Liked" items={liked} />
          </section>
        )}

        {diaryPage.items.length > 0 && (
          <section className="pb-8">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold text-fg">Recent diary</h2>
              {isSelf && (
                <a
                  className="shrink-0 text-sm text-accent hover:text-accent-hi"
                  href="/diary"
                >
                  All diary
                </a>
              )}
            </div>
            <div>
              {diaryPage.items.map((entry, i) => {
                const detail = diaryDetails[i] ?? null;
                if (!detail) return null;
                const state = diaryStates.get(mediaKey(entry));
                return (
                  <DiaryRow
                    key={entry.id}
                    href={detailHref(entry.kind, entry.tmdbId)}
                    title={detail.title}
                    posterPath={detail.posterPath}
                    season={entry.season}
                    episode={entry.episode}
                    watchedAt={entry.watchedAt.toISOString().slice(0, 10)}
                    rewatch={entry.rewatch}
                    rating={state?.rating ?? null}
                    excerpt={state?.review?.body ?? null}
                    canDelete={isSelf}
                    deleteAction={isSelf ? deleteWatchEntry : undefined}
                    entryId={entry.id}
                  />
                );
              })}
            </div>
          </section>
        )}

        {recentReviews.items.length > 0 && (
          <section className="pb-8">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold text-fg">Reviews</h2>
              <a
                className="shrink-0 text-sm text-accent hover:text-accent-hi"
                href={`/u/${profile.id}/reviews`}
              >
                All reviews
              </a>
            </div>
            <div>
              {recentReviews.items.map((review, i) => {
                const detail = reviewDetails[i] ?? null;
                if (!detail) return null;
                const href = detailHref(review.kind, review.tmdbId);
                const poster = imageUrl(detail.posterPath, "w92");
                return (
                  <div
                    key={`${review.kind}-${review.tmdbId}`}
                    className="flex gap-3 border-b border-border py-3"
                  >
                    <a className="shrink-0" href={href}>
                      {poster ? (
                        <img
                          alt=""
                          className="h-[60px] w-10 rounded bg-surface-hi object-cover"
                          height={60}
                          src={poster}
                          width={40}
                        />
                      ) : (
                        <div className="h-[60px] w-10 rounded bg-surface-hi" />
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <a
                          className="text-sm font-medium text-fg hover:text-accent"
                          href={href}
                        >
                          {detail.title}
                        </a>
                        <span className="text-xs text-faint">
                          {review.updatedAt.toISOString().slice(0, 10)}
                        </span>
                      </div>
                      {review.value !== null && (
                        <p
                          aria-label={`Rated ${review.value / 2} of 5`}
                          className="mt-1 text-sm text-accent"
                        >
                          {stars(review.value)}
                        </p>
                      )}
                      {review.containsSpoilers ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted">
                            Contains spoilers
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-fg">
                            {review.body}
                          </p>
                        </details>
                      ) : (
                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted">
                          {review.body}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
