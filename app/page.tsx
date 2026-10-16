import { ContinueWatching } from "@/components/library/continue-watching";
import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import {
 getCardStates,
 getContinueWatching,
 getWatched,
} from "@/lib/library/queries";
import type { ContinueRow } from "@/lib/library/queries";
import type { MediaRef } from "@/lib/library/types";
import { mediaKey } from "@/lib/library/types";
import { mediaSource } from "@/lib/media/runtime";
import type { MediaDetail, MediaSource } from "@/lib/media/types";
import { currentUser } from "@/lib/session";

export const revalidate = 300;

/** Resolves refs through the media source; unresolvable titles drop out. */
async function resolveDetails(
 source: MediaSource,
 refs: MediaRef[],
): Promise<MediaDetail[]> {
 const resolved = await Promise.all(
  refs.map((ref) =>
   ref.kind === "movie" ? source.movie(ref.tmdbId) : source.tv(ref.tmdbId),
  ),
 );
 return resolved.filter((item): item is MediaDetail => item !== null);
}

export default async function Home() {
 const user = await currentUser();
 const source = mediaSource();

 const [films, series, watchedRows, continueRows] = await Promise.all([
  source.trending("movie", "week"),
  source.trending("tv", "week"),
  user
   ? getWatched(user.id, { limit: 12 })
   : Promise.resolve<{ rows: { ref: MediaRef }[]; hasMore: boolean }>({
     rows: [],
     hasMore: false,
    }),
  user ? getContinueWatching(user.id, 12) : Promise.resolve<ContinueRow[]>([]),
 ]);

 // Every ref this page grids: trending, recently watched, in progress.
 // Deduped by key — a title that is both trending and in the diary would
 // otherwise be handed twice, and `getCardStates` costs three watch-state
 // statements plus one watchlist statement per 60-ref chunk, so a duplicate
 // is a real statement, not just a wasted lookup. The page makes no OMDb
 // call at all: grids here show the TMDB score chip, not IMDb/RT.
 const refMap = new Map<string, MediaRef>();
 for (const ref of [
  ...films,
  ...series,
  ...watchedRows.rows.map((row) => row.ref),
  ...continueRows.map((row) => row.ref),
 ]) {
  refMap.set(mediaKey(ref), ref);
 }
 const refs = [...refMap.values()];

 const [recentItems, continueItems, cardStates] = await Promise.all([
  resolveDetails(
   source,
   watchedRows.rows.map(({ ref }) => ref),
  ),
  resolveDetails(
   source,
   continueRows.map((row) => row.ref),
  ),
  user
   ? getCardStates(user.id, refs)
   : Promise.resolve(new Map<string, { watched: boolean; inWatchlist: boolean }>()),
 ]);

 const states = user ? cardStates : undefined;

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
          <ContinueWatching
            items={continueItems}
            rows={continueRows}
            states={states}
          />
          {recentItems.length > 0 ? (
            <PosterGrid
              heading="Recently watched"
              items={recentItems}
              states={states}
              emptyHint="Search for a title and mark it watched."
            />
          ) : null}
          <PosterGrid
            heading="Trending films"
            items={films}
            states={states}
            emptyHint="Search for a title and mark it watched."
          />
          <PosterGrid
            heading="Trending series"
            items={series}
            states={states}
            emptyHint="Search for a title and mark it watched."
          />
        </div>
      </main>
    </>
  );
}
