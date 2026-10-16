import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getCardStates, getWatched } from "@/lib/library/queries";
import type { MediaRef } from "@/lib/library/types";
import { mediaSource } from "@/lib/media/runtime";
import type { MediaDetail } from "@/lib/media/types";
import { getRatingsBatch } from "@/lib/ratings";
import { currentUser } from "@/lib/session";

export const revalidate = 300;

export default async function Home() {
  const user = await currentUser();
  const source = mediaSource();

  const [films, series, watchedRows] = await Promise.all([
    source.trending("movie", "week"),
    source.trending("tv", "week"),
    user
      ? getWatched(user.id, { limit: 12 })
      : Promise.resolve<{ rows: { ref: MediaRef }[]; hasMore: boolean }>({
          rows: [],
          hasMore: false,
        }),
  ]);

  // Every ref this page grids: trending plus recently watched.
  // getCardStates is two indexed D1 reads; getRatingsBatch is
  // KV-cached and rate-limited — a cold cache costs one OMDb
  // call per title (up to ~24 here; KV warms after the first
  // load). Signed-out pages skip both queries entirely.
  const refs: MediaRef[] = [
    ...films,
    ...series,
    ...watchedRows.rows.map(({ ref }) => ref),
  ];

  const [recentItems, cardStates, ratings] = await Promise.all([
    Promise.all(
      watchedRows.rows.map(async ({ ref }) =>
        ref.kind === "movie"
          ? await source.movie(ref.tmdbId)
          : await source.tv(ref.tmdbId),
      ),
    ).then((resolved) =>
      resolved.filter((item): item is MediaDetail => item !== null),
    ),
    user ? getCardStates(user.id, refs) : Promise.resolve(new Map()),
    user
      ? getRatingsBatch(source, refs)
      : Promise.resolve(new Map<string, never>()),
  ]);

  const overlays = user ? { ratings, states: cardStates } : undefined;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:px-6">
        {user ? (
          <div className="mb-8">
            <h1 className="font-display text-2xl sm:text-3xl">
              Welcome back, {user.name}.
            </h1>
            <p className="mt-2 max-w-[65ch] text-base text-muted">
              Mark a film or series watched and it will appear here.
            </p>
          </div>
        ) : (
          <div className="mb-8">
            <h1 className="font-display text-3xl sm:text-display">
              Every film and series you watch, in one place.
            </h1>
            <p className="mt-3 max-w-[65ch] text-base text-muted">
              Track what you have seen, rate it, keep a watchlist, and pick up
              where you left off.
            </p>
            <div className="mt-5 flex items-center gap-4">
              <a
                className="inline-block rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-accent-hi"
                href="/sign-up"
              >
                Create an account
              </a>
              <a className="text-sm text-muted hover:text-fg" href="/search">
                Browse titles
              </a>
            </div>
          </div>
        )}
        <div className="space-y-8">
          {recentItems.length > 0 ? (
            <PosterGrid
              heading="Recently watched"
              items={recentItems}
              ratings={overlays?.ratings}
              states={overlays?.states}
              emptyHint="Search for a title and mark it watched."
            />
          ) : null}
          <PosterGrid
            heading="Trending films"
            items={films}
            ratings={overlays?.ratings}
            states={overlays?.states}
            emptyHint="Search for a title and mark it watched."
          />
          <PosterGrid
            heading="Trending series"
            items={series}
            ratings={overlays?.ratings}
            states={overlays?.states}
            emptyHint="Search for a title and mark it watched."
          />
        </div>
      </main>
    </>
  );
}
