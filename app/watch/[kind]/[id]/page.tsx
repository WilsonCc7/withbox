import { notFound } from "next/navigation";
import { PlayerFrame } from "@/components/player/player-frame";
import { PlayerProgressBridge } from "@/components/player/player-progress-bridge";
import { SourcePicker } from "@/components/player/source-picker";
import { SiteHeader } from "@/components/site-header";
import { getProgress } from "@/lib/library/queries";
import { markWatched, saveProgress } from "@/lib/library/actions";
import { currentUser } from "@/lib/session";
import { RESUME_MIN_SECONDS } from "@/lib/player/progress";
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
 if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();
 if (isTv && episode !== undefined && season === undefined) {
  return message("An episode needs a season.");
 }

 const media = isMovie
  ? await mediaSource().movie(tmdbId)
  : await mediaSource().tv(tmdbId);
 if (!media) notFound();

 // Resuming three seconds in is worse than starting over: a
 // stored position below the floor is noise, not a resume
 // point, so it is deliberately dropped rather than passed.
 // The floor itself lives in lib/player/progress.
 const user = await currentUser();
 const stored = user
  ? await getProgress(
   user.id,
   { kind: isTv ? "tv" : "movie", tmdbId },
   isTv ? season : undefined,
   isTv ? episode : undefined,
  )
  : null;
 const resumeSeconds =
  stored && stored.positionSeconds > RESUME_MIN_SECONDS
   ? stored.positionSeconds
   : undefined;

 // Every adapter that can serve this request, so the page can both choose one
 // and offer the others. Resolving all of them is free: adapters build a URL
 // and perform no I/O. Which one plays is decided in lib/sources, not here.
 const options = await resolveAll(
  tmdbId,
  isTv ? season : undefined,
  isTv ? episode : undefined,
  resumeSeconds,
 );
 // An explicit `?source=` (a remembered choice, or a picker switch) wins;
 // otherwise a stored position promotes a source that actually honours the
 // resume hint, so the bridge mounts and the position is used.
 const resolved = pickStream(options, query.source, {
  preferResume: resumeSeconds !== undefined,
 });

 // Only claim "resuming" when it is true: the active adapter must
 // honour startAtSeconds. vidlink and framextv ignore the hint,
 // so saying "resuming" for them would be a lie.
 const resuming =
  resumeSeconds !== undefined && resolved?.adapter.resumes === true;

 /** Formats a position as m:ss, or h:mm:ss past an hour. */
 function formatPosition(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
 }

 const heading =
  isTv && season !== undefined && episode !== undefined
   ? `${media.title} — S${season}E${episode}`
   : media.title;

 // Auto-advance, crossing season boundaries when the season runs out.
 // Specials (season 0) are excluded from the sequence: they carry no episode
 // order to continue, and advancing from season 1 into "specials" would be
 // wrong.
 const nextHref = (() => {
  if (!isTv || season === undefined || episode === undefined) return null;
  const seasons = (media as TvDetail).seasons
   .filter((s) => s.seasonNumber > 0 && s.episodeCount > 0)
   .sort((a, b) => a.seasonNumber - b.seasonNumber);
  const index = seasons.findIndex((s) => s.seasonNumber === season);
  if (index === -1) return null;

  let nextSeason = season;
  let nextEpisode = episode + 1;
  if (episode >= seasons[index].episodeCount) {
   const following = seasons[index + 1];
   // Final season: there is nothing after it, so playback just stops here.
   if (!following) return null;
   nextSeason = following.seasonNumber;
   nextEpisode = 1;
  }

  const params = new URLSearchParams({
   season: String(nextSeason),
   episode: String(nextEpisode),
  });
  // Carry the source forward: without this, advancing would silently switch
  // the viewer to a different provider mid-run.
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
        saveAction={saveProgress}
        season={isTv ? (season ?? null) : null}
        tmdbId={tmdbId}
       />
      )}

      <SourcePicker
        initialSource={query.source ?? null}
        options={options.map((option) => ({
          name: option.adapter.name,
          label: option.adapter.label,
          href: sourceHref(option.adapter.name),
          progress:
            option.resolution.kind === "iframe" && option.resolution.progress,
        }))}
        resolvedName={resolved.adapter.name}
      >
        {resuming && resumeSeconds !== undefined && (
          <span className="text-faint">
            resuming from {formatPosition(resumeSeconds)}
          </span>
        )}
      </SourcePicker>
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
