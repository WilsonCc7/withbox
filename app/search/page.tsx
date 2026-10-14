import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { mediaSource } from "@/lib/media/runtime";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? await mediaSource().search(query, "multi") : null;

  return (
    <>
      <SiteHeader defaultQuery={query} />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {results ? (
          <>
            <h1 className="mb-6 text-lg text-muted">
              {results.totalResults} result{results.totalResults === 1 ? "" : "s"} for{" "}
              <span className="text-fg">{query}</span>
            </h1>
            <PosterGrid items={results.items} />
          </>
        ) : (
          <h1 className="mb-6 text-lg text-muted">Search films and series.</h1>
        )}
      </main>
    </>
  );
}
