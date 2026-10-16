import { FavoriteToggle } from "@/components/library/favorite-toggle";
import { LikeToggle } from "@/components/library/like-toggle";
import { LogForm } from "@/components/library/log-form";
import { ReviewForm } from "@/components/library/review-form";
import { StarRating } from "@/components/library/star-rating";
import { WatchToggle } from "@/components/library/watch-toggle";
import { WatchlistToggle } from "@/components/library/watchlist-toggle";
import {
  logWatch,
  setRating,
  setReview,
  toggleLiked,
  toggleWatched,
  toggleWatchlist,
} from "@/lib/library/actions";
import type { MediaRef, WatchState } from "@/lib/library/types";
import type { MediaKind } from "@/lib/media/types";

/**
 * The tracking controls for one title, shared by the film and series pages.
 *
 * Server actions are imported here rather than in the presentational
 * components, which take them as props.
 *
 * `liked` and `favorites` are optional so a caller that has not loaded them
 * renders no control rather than a control that cannot work.
 */
export function MediaLibraryPanel({
  kind,
  tmdbId,
  state,
  inWatchlist,
  liked,
  favorites,
}: {
  kind: MediaKind;
  tmdbId: number;
  state: WatchState;
  inWatchlist: boolean;
  liked?: boolean;
  favorites?: (MediaRef | null)[];
}) {
  const slotIndex =
    favorites === undefined
      ? -1
      : favorites.findIndex((f) => f?.kind === kind && f?.tmdbId === tmdbId);
  const currentSlot = slotIndex === -1 ? null : slotIndex;

  return (
    <section className="mt-8 flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-4">
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
        {liked !== undefined && (
          <LikeToggle action={toggleLiked} kind={kind} liked={liked} tmdbId={tmdbId} />
        )}
        <StarRating action={setRating} kind={kind} tmdbId={tmdbId} value={state.rating} />
        {state.watchedAt && (
          <span className="text-xs text-faint">
            Last watched {state.watchedAt.toISOString().slice(0, 10)}
          </span>
        )}
      </div>

      {favorites !== undefined && (
        <FavoriteToggle
          currentSlot={currentSlot}
          kind={kind}
          occupied={favorites.map((favorite) => favorite !== null)}
          tmdbId={tmdbId}
        />
      )}

      <ReviewForm
        action={setReview}
        body={state.review?.body ?? ""}
        containsSpoilers={state.review?.containsSpoilers ?? false}
        kind={kind}
        tmdbId={tmdbId}
      />

      <LogForm
        alreadyWatched={state.watched}
        defaultDate={new Date().toISOString().slice(0, 10)}
        kind={kind}
        log={logWatch}
        tmdbId={tmdbId}
      />
    </section>
  );
}
