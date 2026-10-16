import type { MediaSummary } from "@/lib/media/types";
import type { MediaRatings } from "@/lib/ratings";
import { MediaCard } from "@/components/media-card";
import { mediaKey } from "@/lib/library/types";

export function PosterGrid({
  items,
  heading,
  ratings,
  states,
  emptyHint,
}: {
  items: MediaSummary[];
  heading?: string;
  /** Keyed by `mediaKey`; absent on signed-out and detail-only pages. */
  ratings?: Map<string, MediaRatings>;
  /** Keyed by `mediaKey`; absent when signed out. */
  states?: Map<string, { watched: boolean; inWatchlist: boolean }>;
  /** One line telling the user what to do next; shown under the empty copy. */
  emptyHint?: string;
}) {
  return (
    <section>
      {heading && (
        <h2 className="mb-4 text-xl font-semibold text-fg">{heading}</h2>
      )}
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-muted">
          Nothing here yet.
          {emptyHint && <p className="mt-2 text-xs text-faint">{emptyHint}</p>}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <li key={`${item.kind}-${item.tmdbId}`}>
              <MediaCard
                item={item}
                ratings={ratings?.get(mediaKey(item))}
                state={states?.get(mediaKey(item))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
