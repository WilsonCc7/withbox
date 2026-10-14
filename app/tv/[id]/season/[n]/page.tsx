import { SiteHeader } from "@/components/site-header";
import { imageUrl } from "@/lib/media/images";
import { mediaSource } from "@/lib/media/runtime";

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string; n: string }>;
}) {
  const { id, n } = await params;
  const tmdbId = Number(id);
  const seasonNumber = Number(n);

  const invalid =
    !Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(seasonNumber) || seasonNumber < 0;

  const show = invalid ? null : await mediaSource().tv(tmdbId);
  const episodes = show ? await mediaSource().episodes(tmdbId, seasonNumber) : [];

  if (!show) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">No series with id {id}.</h1>
        </main>
      </>
    );
  }

  const season = show.seasons.find((s) => s.seasonNumber === seasonNumber);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <p className="text-xs uppercase tracking-wide text-accent">
          <a className="hover:text-accent-hi" href={`/tv/${show.tmdbId}`}>
            {show.title}
          </a>
        </p>
        <h1 className="mt-1 mb-6 text-2xl font-semibold">
          {season?.name ?? `Season ${seasonNumber}`}
        </h1>

        {episodes.length === 0 ? (
          <p className="text-muted">No episodes listed for this season.</p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {episodes.map((episode) => {
              const still = imageUrl(episode.stillPath, "w300");
              return (
                <li className="flex gap-4 p-4" key={episode.episodeNumber}>
                  <div className="w-28 shrink-0 sm:w-40">
                    {still ? (
                      <img
                        alt=""
                        className="w-full rounded border border-border"
                        height={169}
                        loading="lazy"
                        src={still}
                        width={300}
                      />
                    ) : (
                      <div className="aspect-video w-full rounded border border-border bg-surface-hi" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className="text-faint">{episode.episodeNumber}.</span> {episode.name}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {[
                        episode.airDate,
                        episode.runtime ? `${episode.runtime}m` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {episode.overview && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                        {episode.overview}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </>
  );
}
