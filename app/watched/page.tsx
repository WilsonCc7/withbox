import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getCardStates, getWatched } from "@/lib/library/queries";
import type { MediaDetail, MediaKind } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { getRatingsBatch } from "@/lib/ratings";
import { currentUser } from "@/lib/session";

const PAGE_SIZE = 60;
const MAX_PAGE = 1000;

function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/**
 * Build a query string preserving the filters this page cares about.
 * Omitting `page` yields the first page — a filter change must not
 * strand the viewer on page 3 of a 1-page result.
 */
function hrefFor(opts: {
  page?: number;
  kind?: MediaKind;
  sort?: "recent" | "rating";
}): string {
  const params = new URLSearchParams();
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.sort && opts.sort !== "recent") params.set("sort", opts.sort);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/watched?${qs}` : "/watched";
}

export default async function WatchedPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    kind?: string;
    sort?: string;
  }>;
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

  const { page: pageRaw, kind: kindRaw, sort: sortRaw } = await searchParams;
  const page = parsePage(pageRaw);
  const kind = kindRaw === "movie" || kindRaw === "tv" ? kindRaw : undefined;
  const sort = sortRaw === "rating" ? "rating" : "recent";

  const { rows, hasMore } = await getWatched(user.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    kind,
    sort,
  });
  const source = mediaSource();

  // The refs this grid shows. getCardStates is two indexed D1 reads;
  // getRatingsBatch is KV-cached and rate-limited — a cold cache
  // costs one OMDb call per title (up to 60 on a first, empty view).
  const refs = rows.map(({ ref }) => ref);
  const [items, cardStates, ratings] = await Promise.all([
    Promise.all(
      refs.map(async (ref) =>
        ref.kind === "movie" ? await source.movie(ref.tmdbId) : await source.tv(ref.tmdbId),
      ),
    ).then((resolved) =>
      resolved.filter((item): item is MediaDetail => item !== null),
    ),
    getCardStates(user.id, refs),
    getRatingsBatch(source, refs),
  ]);

  const singlePage = page === 1 && !hasMore;

  const filterRow = (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <a
        className={kind ? "text-accent hover:text-accent-hi" : "font-semibold text-fg"}
        href={hrefFor({ page: 1, sort })}
      >
        All
      </a>
      <a
        className={kind === "movie" ? "font-semibold text-fg" : "text-accent hover:text-accent-hi"}
        href={hrefFor({ page: 1, kind: "movie", sort })}
      >
        Films
      </a>
      <a
        className={kind === "tv" ? "font-semibold text-fg" : "text-accent hover:text-accent-hi"}
        href={hrefFor({ page: 1, kind: "tv", sort })}
      >
        Series
      </a>
      <span className="text-faint" aria-hidden="true">
        ·
      </span>
      <a
        className={
          sort === "recent" ? "font-semibold text-fg" : "text-accent hover:text-accent-hi"
        }
        href={hrefFor({ page: 1, kind })}
      >
        Recently watched
      </a>
      <a
        className={
          sort === "rating" ? "font-semibold text-fg" : "text-accent hover:text-accent-hi"
        }
        href={hrefFor({ page: 1, kind, sort: "rating" })}
      >
        Highest rated
      </a>
    </div>
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {filterRow}
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
          <PosterGrid
            heading={`Watched (${items.length})`}
            items={items}
            ratings={ratings}
            states={cardStates}
          />
        ) : (
          <>
            <h2 className="text-xl font-semibold text-fg">Watched</h2>
            <p className="mb-4 text-muted text-sm">Page {page}</p>
            <PosterGrid items={items} ratings={ratings} states={cardStates} />
          </>
        )}
        {(page > 1 || hasMore) && (
          <nav className="mt-6 flex items-center gap-4">
            {page > 1 && (
              <a
                className="text-sm text-accent hover:text-accent-hi"
                href={hrefFor({ page: page - 1, kind, sort })}
              >
                Newer
              </a>
            )}
            {hasMore && (
              <a
                className="text-sm text-accent hover:text-accent-hi"
                href={hrefFor({ page: page + 1, kind, sort })}
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
