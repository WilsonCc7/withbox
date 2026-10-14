import { EpisodeMarker } from "@/components/library/episode-marker";
import { MarkSeasonForm } from "@/components/library/mark-season-form";
import { SiteHeader } from "@/components/site-header";
import { markSeason, toggleWatched } from "@/lib/library/actions";
import { getEpisodeMarks } from "@/lib/library/queries";
import { imageUrl } from "@/lib/media/images";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

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

  const user = await currentUser();
  const marks = user ? await getEpisodeMarks(user.id, tmdbId) : [];
  const watchedEpisodes = new Set(
    marks.filter((m) => m.season === seasonNumber).map((m) => m.episode),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <p className="text-xs uppercase tracking-wide text-accent">
          <a className="hover:text-accent-hi" href={`/tv/${show.tmdbId}`}>
            {show.title}
          </a>
        </p>
        <h1 className="mt-1 mb-2 text-2xl font-semibold">
          {season?.name ?? `Season ${seasonNumber}`}
        </h1>

        {user && episodes.length > 0 && (
          <p className="mb-4 text-sm text-muted">
            {watchedEpisodes.size} of {episodes.length} watched
            <span className="ml-3 inline-block">
              <MarkSeasonForm
                action={markSeason}
                episodes={episodes.map((e) => e.episodeNumber)}
                season={seasonNumber}
                tmdbId={tmdbId}
              />
            </span>
          </p>
        )}

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
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <span className="text-faint">{episode.episodeNumber}.</span> {episode.name}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {[episode.airDate, episode.runtime ? `${episode.runtime}m` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {episode.overview && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                        {episode.overview}
                      </p>
                    )}
                    {user && (
                      <div className="mt-2">
                        <EpisodeMarker
                          action={toggleWatched}
                          episode={episode.episodeNumber}
                          kind="tv"
                          name={episode.name}
                          season={seasonNumber}
                          tmdbId={tmdbId}
                          watched={watchedEpisodes.has(episode.episodeNumber)}
                        />
                      </div>
                    )}
                    <p className="mt-2">
                      <a
                        className="inline-block rounded border border-border px-3 py-1 text-xs text-accent hover:border-faint"
                        href={`/watch/tv/${tmdbId}?season=${seasonNumber}&episode=${episode.episodeNumber}`}
                      >
                        ▶ Play
                      </a>
                    </p>
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
