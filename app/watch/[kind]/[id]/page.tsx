import { PlayerFrame } from "@/components/player/player-frame";
import { SiteHeader } from "@/components/site-header";
import { mediaSource } from "@/lib/media/runtime";
import { resolveStream } from "@/lib/sources";

/**
 * Playback. `/watch/movie/550`, `/watch/tv/1399?season=1&episode=1`.
 *
 * Stream resolution goes through `lib/sources`; this route builds no
 * third-party URL itself.
 */
export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ season?: string; episode?: string }>;
}) {
  const { kind, id } = await params;
  const query = await searchParams;

  const tmdbId = Number(id);
  const isMovie = kind === "movie";
  const isTv = kind === "tv";
  const season = query.season === undefined ? undefined : Number(query.season);
  const episode = query.episode === undefined ? undefined : Number(query.episode);

  const header = <SiteHeader />;
  const message = (text: string) => (
    <>
      {header}
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-xl">{text}</h1>
      </main>
    </>
  );

  if (!isMovie && !isTv) return message(`Unknown media kind: ${kind}`);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return message("Not a valid id.");
  if (isTv && episode !== undefined && season === undefined) {
    return message("An episode needs a season.");
  }

  const media = isMovie
    ? await mediaSource().movie(tmdbId)
    : await mediaSource().tv(tmdbId);
  if (!media) return message(`Nothing found for id ${tmdbId}.`);

  const resolved = await resolveStream(
    tmdbId,
    isTv ? season : undefined,
    isTv ? episode : undefined,
  );

  const heading =
    isTv && season !== undefined && episode !== undefined
      ? `${media.title} — S${season}E${episode}`
      : media.title;

  return (
    <>
      {header}
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">
          {isTv ? "Series" : "Film"}
        </p>
        <h1 className="mb-4 text-2xl font-semibold">{heading}</h1>

        {resolved ? (
          <>
            <PlayerFrame resolution={resolved.resolution} title={heading} />
            <p className="mt-3 text-xs text-faint">
              Source: {resolved.adapter.label}
              {resolved.resolution.kind === "iframe" && !resolved.resolution.progress && (
                <> · this source cannot report playback position, so mark it watched yourself</>
              )}
            </p>
          </>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-surface text-sm text-muted">
            No source could play this title.
          </div>
        )}

        <p className="mt-6 text-sm text-muted">
          <a className="text-accent hover:text-accent-hi" href={isTv ? `/tv/${tmdbId}` : `/movie/${tmdbId}`}>
            ← Back to details
          </a>
        </p>
      </main>
    </>
  );
}
