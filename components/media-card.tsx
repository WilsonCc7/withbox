import type { MediaSummary } from "@/lib/media/types";
import type { MediaRatings } from "@/lib/ratings";
import { imageUrl } from "@/lib/media/images";
import { CardQuickActions } from "@/components/card-quick-actions";
import { RatingBadges } from "@/components/rating-badges";

const POSTER_WIDTH = 342;
const POSTER_HEIGHT = 513;

/**
 * One poster in a grid.
 *
 * The root is a div wrapping the link so the quick actions can be
 * siblings of the anchor — a button inside an anchor navigates as
 * well as toggling. With no `state` (signed out) the card is a plain
 * link, unchanged from before.
 */
export function MediaCard({
  item,
  ratings,
  state,
  progress,
  caption,
}: {
  item: MediaSummary;
  /** OMDb scores when the key is configured; absent renders the TMDB chip. */
  ratings?: MediaRatings;
  /** Per-user overlay state, signed in only. */
  state?: { watched: boolean; inWatchlist: boolean };
  /** 0–1 watched fraction; the poster foot bar is omitted when absent. */
  progress?: number;
  /** One short line under the title block (e.g. the resume point). */
  caption?: string;
}) {
  const href = item.kind === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
  const poster = imageUrl(item.posterPath, "w342");

  return (
    /* The ring has to live on the root: the anchor inside it gets the global
       amber outline, and the root's `overflow-hidden` (what keeps the poster
       and the progress bar inside the rounded corners) clips it away. An
       outline is drawn outside the element's own border box, so the root's
       own ring survives its own clipping. `focus-within` rather than
       `focus-visible`: the ring brackets the whole card, and only a keyboard
       or pointer focus on the link or an overlay button can trigger it. */
    <div className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-strong bg-surface transition-colors hover:border-faint focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <a className="flex flex-1 flex-col" href={href}>
        <div className="relative aspect-[2/3] w-full bg-surface-hi">
          {poster ? (
            <img
              alt={`${item.title} poster`}
              className="absolute inset-0 h-full w-full object-cover"
              height={POSTER_HEIGHT}
              loading="lazy"
              src={poster}
              width={POSTER_WIDTH}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-faint">
              <span className="text-xs uppercase tracking-widest">No poster</span>
            </div>
          )}
          {/* Anchored to the poster, not the card: the title block
              sits below it and must stay legible. The max width keeps a
              long chip row from running off the poster. */}
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] whitespace-nowrap">
            <RatingBadges
              imdb={ratings?.imdb ?? null}
              rt={ratings?.rt ?? null}
              size="sm"
              tmdbScore={item.voteAverage}
              voteCount={item.voteCount}
            />
          </span>
          {progress !== undefined && (
            /* Sits on the poster, not the card: the title block below must
               stay readable. The wrapper is already `overflow-hidden`, so
               the 0% case is a zero-width sliver with no clipping artifact. */
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-bg/70">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="text-sm font-semibold leading-snug text-fg">{item.title}</h3>
          {/* The year alone: `RatingBadges` already shows the labelled score
              chip above, so a bare number here read as a second, unlabelled
              score. The `Series` marker moved off the poster into this line. */}
          <p className="text-xs text-muted">
            {[item.kind === "tv" ? "Series" : null, item.year].filter(Boolean).join(" · ") || "\u00A0"}
          </p>
          {caption && <p className="text-xs text-muted">{caption}</p>}
        </div>
      </a>
      {state && (
        <CardQuickActions
          inWatchlist={state.inWatchlist}
          kind={item.kind}
          tmdbId={item.tmdbId}
          watched={state.watched}
        />
      )}
    </div>
  );
}
