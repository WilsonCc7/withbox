import { SiteHeader } from "@/components/site-header";
import { imageUrl } from "@/lib/media/images";
import { mediaSource } from "@/lib/media/runtime";

export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">Not a valid series id.</h1>
        </main>
      </>
    );
  }

  const show = await mediaSource().tv(tmdbId);

  if (!show) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">No series with id {tmdbId}.</h1>
        </main>
      </>
    );
  }

  const backdrop = imageUrl(show.backdropPath, "w1280");
  const poster = imageUrl(show.posterPath, "w342");
  const episodeCount = show.seasons.reduce((sum, season) => sum + season.episodeCount, 0);
  const facts = [
    show.year,
    show.status,
    `${show.seasons.length} season${show.seasons.length === 1 ? "" : "s"}`,
    `${episodeCount} episodes`,
    show.genres.map((g) => g.name).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="relative mb-6 h-48 overflow-hidden rounded-lg bg-surface sm:h-64">
          {backdrop && (
            <img
              alt=""
              className="h-full w-full object-cover opacity-60"
              height={720}
              src={backdrop}
              width={1280}
            />
          )}
        </div>

        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="w-32 shrink-0 sm:w-48">
            {poster ? (
              <img
                alt={show.title}
                className="w-full rounded-lg border border-border"
                height={513}
                src={poster}
                width={342}
              />
            ) : (
              <div className="aspect-2/3 w-full rounded-lg border border-border bg-surface-hi" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-accent">Series</p>
            <h1 className="mt-1 text-3xl font-semibold leading-tight">
              {show.title}
              {show.year && <span className="ml-2 font-normal text-muted">{show.year}</span>}
            </h1>

            {facts && <p className="mt-2 text-sm text-muted">{facts}</p>}

            {show.voteAverage !== null && (
              <p className="mt-2 text-sm text-muted">
                <span className="text-accent">★ {show.voteAverage.toFixed(1)}</span>
                {show.voteCount !== null && (
                  <span className="text-faint"> ({show.voteCount.toLocaleString()} votes)</span>
                )}
              </p>
            )}

            {show.overview && <p className="mt-4 max-w-2xl leading-7 text-muted">{show.overview}</p>}
          </div>
        </div>

        <h2 className="mt-10 mb-4 text-lg font-semibold">Seasons</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {show.seasons.map((season) => (
            <li key={season.seasonNumber}>
              <a
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-hi"
                href={`/tv/${show.tmdbId}/season/${season.seasonNumber}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{season.name}</span>
                  <span className="block text-xs text-faint">
                    {season.episodeCount} episode{season.episodeCount === 1 ? "" : "s"}
                    {season.airDate && ` · ${season.airDate.slice(0, 4)}`}
                  </span>
                </span>
                <span aria-hidden className="text-accent">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
