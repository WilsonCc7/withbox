import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getCardStates } from "@/lib/library/queries";
import { mediaSource } from "@/lib/media/runtime";
import { getRatingsBatch } from "@/lib/ratings";
import { currentUser } from "@/lib/session";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await currentUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? await mediaSource().search(query, "multi") : null;

  // getCardStates is two indexed D1 reads; getRatingsBatch is
  // KV-cached and rate-limited — a cold cache costs one OMDb
  // call per title (up to 8 suggestions' worth on a full page).
  // Signed-out searches skip both.
  const [cardStates, ratings] = results
    ? await Promise.all([
        user ? getCardStates(user.id, results.items) : Promise.resolve(new Map()),
        user
          ? getRatingsBatch(mediaSource(), results.items)
          : Promise.resolve(new Map<string, never>()),
      ])
    : [new Map(), new Map<string, never>()];

  const overlays = user ? { ratings, states: cardStates } : undefined;

  return (
    <>
      <SiteHeader defaultQuery={query} />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {results === null ? (
          <>
            <h1 className="mb-6 text-lg text-muted">Search films and series.</h1>
            <p className="text-muted">Type a title in the box above to search.</p>
          </>
        ) : results.totalResults === 0 ? (
          <>
            <h1 className="mb-6 text-lg text-fg">No results for {query}.</h1>
            <p className="mb-6 text-muted">
              Check the spelling, or try a different title.
            </p>
            <a className="text-accent hover:text-accent-hi" href="/">
              Browse trending
            </a>
          </>
        ) : (
          <>
            <h1 className="mb-6 text-lg text-muted">
              {results.totalResults} result{results.totalResults === 1 ? "" : "s"}{" "}
              for <span className="text-fg">{query}</span>
            </h1>
            <PosterGrid
              items={results.items}
              ratings={overlays?.ratings}
              states={overlays?.states}
            />
          </>
        )}
      </main>
    </>
  );
}
