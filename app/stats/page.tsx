import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getCardStates } from "@/lib/library/queries";
import type { MediaRef } from "@/lib/library/types";
import type { MediaSummary } from "@/lib/media/types";
import { getLibraryStats } from "@/lib/stats";
import { currentUser } from "@/lib/session";

/** Digits only and in range; anything else means "all time". */
function parseYear(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/stats">
              Sign in
            </a>{" "}
            to see your stats.
          </h1>
        </main>
      </>
    );
  }

  const query = await searchParams;
  const year = parseYear(query.year);
  const stats = await getLibraryStats(user.id, year === null ? {} : { year });

  const chip = (active: boolean): string =>
    `rounded-md border px-2.5 py-1 text-sm ${
      active ? "border-accent text-fg" : "border-border text-muted hover:text-fg"
    }`;

  const topRatedRefs: MediaRef[] = stats.topRated.map((item) => item.ref);
  const topRatedItems: MediaSummary[] = stats.topRated.map(
    ({ ref, title, year: titleYear, posterPath }): MediaSummary => ({
      kind: ref.kind,
      tmdbId: ref.tmdbId,
      title,
      year: titleYear,
      overview: "",
      posterPath,
      backdropPath: null,
      voteAverage: null,
      voteCount: null,
    }),
  );
  const states =
    topRatedRefs.length > 0 ? await getCardStates(user.id, topRatedRefs) : undefined;

  const figures: { label: string; value: string }[] = [
    { label: "Films", value: String(stats.films) },
    { label: "Series", value: String(stats.series) },
    { label: "Episodes", value: String(stats.episodes) },
    { label: "Diary entries", value: String(stats.diaryEntries) },
    { label: "Rewatches", value: String(stats.rewatches) },
    {
      label:
        stats.ratings.average === null
          ? "Ratings"
          : `Ratings · avg ${stats.ratings.average.toFixed(1)}`,
      value: String(stats.ratings.count),
    },
    { label: "Reviews", value: String(stats.reviews) },
    { label: "Likes", value: String(stats.likes) },
    { label: "Favourites", value: String(stats.favorites) },
    { label: "Longest streak (days)", value: String(stats.longestStreak) },
    {
      label: "First watch",
      value: stats.firstWatch === null ? "—" : stats.firstWatch.toISOString().slice(0, 10),
    },
  ];

  const maxYear = Math.max(1, ...stats.byYear.map((row) => row.count));
  const maxGenre = Math.max(1, ...stats.genres.map((row) => row.count));

  // `byYear` alone is not "empty": a title can be rated or liked without a
  // diary row, and those numbers deserve to be shown.
  const empty =
    stats.byYear.length === 0 &&
    stats.ratings.count === 0 &&
    stats.reviews === 0 &&
    stats.likes === 0 &&
    stats.favorites === 0;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="pb-4 pt-8">
          <h1 className="text-2xl font-semibold text-fg">Stats</h1>
          <p className="mt-1 text-xs text-faint">
            Counted from your diary — nothing here is stored separately.
          </p>
        </div>

        {empty ? (
          <p className="text-muted">
            Nothing here yet. Log a watch from any title page and your numbers will
            start counting.
          </p>
        ) : (
          <>
            {stats.byYear.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <a
                  aria-current={year === null ? "page" : undefined}
                  className={chip(year === null)}
                  href="/stats"
                >
                  All time
                </a>
                {stats.byYear.map((row) => (
                  <a
                    key={row.year}
                    aria-current={row.year === year ? "page" : undefined}
                    className={chip(row.year === year)}
                    href={`/stats?year=${row.year}`}
                  >
                    {row.year}
                  </a>
                ))}
              </div>
            )}

            {year !== null && (
              <p className="mt-2 text-xs text-faint">
                Films, episodes, the streak and the first watch are filtered to {year}.
                Ratings, reviews, likes and favourites are all time.
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <p className="text-3xl font-display tnum text-fg">{figure.value}</p>
                  <p className="text-sm text-muted">{figure.label}</p>
                </div>
              ))}
            </div>

            {stats.byYear.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold text-fg">Diary by year</h2>
                <div aria-hidden="true" className="mt-3 flex h-32 items-end gap-2">
                  {stats.byYear.map((row) => (
                    <div
                      key={row.year}
                      className="flex-1 rounded-t border border-border bg-accent/60"
                      style={{
                        height: `${Math.max(4, Math.round((row.count / maxYear) * 100))}%`,
                      }}
                    />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  {stats.byYear.map((row) => (
                    <li key={row.year}>
                      {row.year} — <span className="tnum">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {topRatedItems.length > 0 && (
              <div className="mt-10">
                <PosterGrid heading="Top rated" items={topRatedItems} states={states} />
              </div>
            )}

            {stats.genres.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold text-fg">Genres</h2>
                <ul className="mt-3 space-y-1">
                  {stats.genres.map((row) => (
                    <li key={row.name} className="flex items-center gap-3 text-sm text-muted">
                      <span className="w-32 shrink-0 truncate">{row.name}</span>
                      <span
                        aria-hidden="true"
                        className="h-2 rounded-full bg-accent/60"
                        style={{ width: `${Math.round((row.count / maxGenre) * 100)}%` }}
                      />
                      <span className="tnum">{row.count}</span>
                    </li>
                  ))}
                </ul>
                {stats.titleCount > stats.cappedAt && (
                  <p className="mt-2 text-sm text-faint">
                    Genres cover the newest {stats.cappedAt} of {stats.titleCount} titles.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
