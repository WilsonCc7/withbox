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
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {recentItems.length > 0 ? (
          <PosterGrid
            heading="Recently watched"
            items={recentItems}
            ratings={overlays?.ratings}
            states={overlays?.states}
          />
        ) : user ? (
          <p className="mb-6 text-muted">
            Welcome back, {user.name}. Mark a film or series watched and it will
            appear here.
          </p>
        ) : null}
        <PosterGrid
          heading="Trending films"
          items={films}
          ratings={overlays?.ratings}
          states={overlays?.states}
        />
        <PosterGrid
          heading="Trending series"
          items={series}
          ratings={overlays?.ratings}
          states={overlays?.states}
        />
      </main>
    </>
  );
}
