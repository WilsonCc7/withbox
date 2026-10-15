import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getWatchlist } from "@/lib/library/queries";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

const PAGE_SIZE = 60;
const MAX_PAGE = 1000;

function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;
  return Math.min(Math.max(Number(raw), 1), MAX_PAGE);
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/watchlist">
              Sign in
            </a>{" "}
            to keep a watchlist.
          </h1>
        </main>
      </>
    );
  }

  const page = parsePage((await searchParams).page);
  const { refs, hasMore } = await getWatchlist(user.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const source = mediaSource();

  const items = (
    await Promise.all(
      refs.map(async (ref) =>
        ref.kind === "movie" ? await source.movie(ref.tmdbId) : await source.tv(ref.tmdbId),
      ),
    )
  ).filter((item): item is MediaDetail => item !== null);

  // The total is only known when the whole set fits on page 1.
  const showTotal = page === 1 && !hasMore;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {items.length === 0 && page === 1 && (
          <p className="pb-4 text-muted">
            Your watchlist is empty.{" "}
            <a className="text-accent hover:text-accent-hi" href="/">
              Browse trending
            </a>
          </p>
        )}
        {items.length === 0 && page > 1 && (
          <p className="pb-4 text-muted">
            No more titles.{" "}
            <a className="text-accent hover:text-accent-hi" href="/watchlist">
              Back to the first page
            </a>
          </p>
        )}
        {!showTotal && <p className="pb-4 text-muted text-sm">Page {page}</p>}
        <PosterGrid
          heading={showTotal ? `Watchlist (${items.length})` : "Watchlist"}
          items={items}
        />
        {(page > 1 || hasMore) && (
          <nav className="mt-6 flex items-center gap-4">
            {page > 1 && (
              <a
                className="text-sm text-accent hover:text-accent-hi"
                href={page - 1 <= 1 ? "/watchlist" : `/watchlist?page=${page - 1}`}
              >
                Newer
              </a>
            )}
            {hasMore && (
              <a
                className="text-sm text-accent hover:text-accent-hi"
                href={`/watchlist?page=${page + 1}`}
              >
                Older
              </a>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
