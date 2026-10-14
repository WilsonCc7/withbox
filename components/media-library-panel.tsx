import { ReviewForm } from "@/components/library/review-form";
import { StarRating } from "@/components/library/star-rating";
import { WatchToggle } from "@/components/library/watch-toggle";
import { WatchlistToggle } from "@/components/library/watchlist-toggle";
import { setRating, setReview, toggleWatched, toggleWatchlist } from "@/lib/library/actions";
import type { WatchState } from "@/lib/library/types";
import type { MediaKind } from "@/lib/media/types";

/**
 * The tracking controls for one title, shared by the film and series pages.
 *
 * Server actions are imported here rather than in the presentational
 * components, which take them as props.
 */
export function MediaLibraryPanel({
  kind,
  tmdbId,
  state,
  inWatchlist,
}: {
  kind: MediaKind;
  tmdbId: number;
  state: WatchState;
  inWatchlist: boolean;
}) {
  return (
    <section className="mt-8 flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <WatchToggle
          action={toggleWatched}
          kind={kind}
          tmdbId={tmdbId}
          watched={state.watched}
        />
        <WatchlistToggle
          action={toggleWatchlist}
          inWatchlist={inWatchlist}
          kind={kind}
          tmdbId={tmdbId}
        />
        {state.watchedAt && (
          <span className="text-xs text-faint">
            Last watched {state.watchedAt.toISOString().slice(0, 10)}
          </span>
        )}
      </div>

      <StarRating action={setRating} kind={kind} tmdbId={tmdbId} value={state.rating} />

      <ReviewForm
        action={setReview}
        body={state.review?.body ?? ""}
        containsSpoilers={state.review?.containsSpoilers ?? false}
        kind={kind}
        tmdbId={tmdbId}
      />
    </section>
  );
}
