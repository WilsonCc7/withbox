import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getWatched } from "@/lib/library/queries";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

const PAGE_SIZE = 60;
const MAX_PAGE = 1000;

function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

export default async function WatchedPage({
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
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/watched">
              Sign in
            </a>{" "}
            to track what you&apos;ve watched.
          </h1>
        </main>
      </>
    );
  }

  const page = parsePage((await searchParams).page);
  const { rows, hasMore } = await getWatched(user.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const source = mediaSource();

  const items = (
    await Promise.all(
      rows.map(async ({ ref }) =>
        ref.kind === "movie" ? await source.movie(ref.tmdbId) : await source.tv(ref.tmdbId),
      ),
    )
  ).filter((item): item is MediaDetail => item !== null);

  const singlePage = page === 1 && !hasMore;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {items.length === 0 &&
          (page === 1 ? (
            <p className="pb-4 text-muted">
              Nothing watched yet.{" "}
              <a className="text-accent hover:text-accent-hi" href="/">
                Browse trending
              </a>
            </p>
          ) : (
            <p className="pb-4 text-muted">
              No more titles.{" "}
              <a className="text-accent hover:text-accent-hi" href="/watched">
                Back to the first page
              </a>
            </p>
          ))}
        {singlePage ? (
          <PosterGrid heading={`Watched (${items.length})`} items={items} />
        ) : (
          <>
            <h2 className="text-xl font-semibold text-fg">Watched</h2>
            <p className="mb-4 text-muted text-sm">Page {page}</p>
            <PosterGrid items={items} />
          </>
        )}
        {(page > 1 || hasMore) && (
          <nav className="mt-6 flex items-center gap-4">
            {page > 1 && (
              <a
                className="text-sm text-accent hover:text-accent-hi"
                href={page - 1 <= 1 ? "/watched" : `/watched?page=${page - 1}`}
              >
                Newer
              </a>
            )}
            {hasMore && (
              <a
                className="text-sm text-accent hover:text-accent-hi"
                href={`/watched?page=${page + 1}`}
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
