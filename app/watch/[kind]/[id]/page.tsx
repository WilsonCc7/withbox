import { PlayerFrame } from "@/components/player/player-frame";
import { PlayerProgressBridge } from "@/components/player/player-progress-bridge";
import { SiteHeader } from "@/components/site-header";
import { markWatched } from "@/lib/library/actions";
import { mediaSource } from "@/lib/media/runtime";
import { pickStream, resolveAll } from "@/lib/sources";
import type { TvDetail } from "@/lib/media/types";

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
 searchParams: Promise<{ season?: string; episode?: string; source?: string }>;
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

 // Every adapter that can serve this request, so the page can both choose one
 // and offer the others. Resolving all of them is free: adapters build a URL
 // and perform no I/O. Which one plays is decided in lib/sources, not here.
 const options = await resolveAll(
  tmdbId,
  isTv ? season : undefined,
  isTv ? episode : undefined,
 );
 const resolved = pickStream(options, query.source);

 const heading =
  isTv && season !== undefined && episode !== undefined
   ? `${media.title} — S${season}E${episode}`
   : media.title;

 // Auto-advance within a season only. Crossing into the next season would need
 // that season's episode list, which this page has no reason to load.
 const nextHref = (() => {
  if (!isTv || season === undefined || episode === undefined) return null;
  const seasonInfo = (media as TvDetail).seasons.find((s) => s.seasonNumber === season);
  if (!seasonInfo || episode >= seasonInfo.episodeCount) return null;
  const params = new URLSearchParams({
   season: String(season),
   episode: String(episode + 1),
  });
  // Carry the source forward: without this, advancing would silently switch
  // the viewer to a different provider mid-season.
  if (resolved) params.set("source", resolved.adapter.name);
  return `/watch/tv/${tmdbId}?${params.toString()}`;
 })();

 // Same title, different provider. Season and episode must survive the switch,
 // or the link would drop the viewer back to the start of the season.
 const sourceHref = (name: string) => {
  const params = new URLSearchParams();
  if (isTv && season !== undefined) params.set("season", String(season));
  if (isTv && episode !== undefined) params.set("episode", String(episode));
  params.set("source", name);
  const base = isTv ? `/watch/tv/${tmdbId}` : `/watch/movie/${tmdbId}`;
  return `${base}?${params.toString()}`;
 };

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

      {resolved.resolution.kind === "iframe" && resolved.resolution.progress && (
       <PlayerProgressBridge
        allowedOrigin={new URL(resolved.resolution.url).origin}
        episode={isTv ? (episode ?? null) : null}
        kind={isTv ? "tv" : "movie"}
        markAction={markWatched}
        nextHref={nextHref}
        season={isTv ? (season ?? null) : null}
        tmdbId={tmdbId}
       />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
       <span>Source:</span>
       {options.map((option) =>
        // Highlight the adapter that is ACTUALLY playing, not the one
        // requested — otherwise a fallback would show a source as
        // selected while a different one plays.
        option.adapter.name === resolved.adapter.name ? (
         <span className="font-medium text-fg" key={option.adapter.name}>
          {option.adapter.label}
         </span>
        ) : (
         <a
          className="text-muted hover:text-accent"
          href={sourceHref(option.adapter.name)}
          key={option.adapter.name}
         >
          {option.adapter.label}
         </a>
        ),
       )}
      </div>
      <p className="mt-1 text-xs text-faint">
       {resolved.resolution.kind === "iframe" && !resolved.resolution.progress && (
        <>this source cannot report playback position, so mark it watched yourself</>
       )}
       {resolved.resolution.kind === "iframe" && resolved.resolution.progress && (
        <>marks itself watched when you finish{nextHref ? ", then plays the next episode" : ""}</>
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
