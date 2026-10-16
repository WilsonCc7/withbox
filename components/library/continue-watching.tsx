import type { MediaSummary } from "@/lib/media/types";
import type { ContinueRow } from "@/lib/library/queries";
import { mediaKey } from "@/lib/library/types";
import { PosterGrid } from "@/components/poster-grid";

/**
 * The home rail for part-watched titles.
 *
 * `rows` come from `getContinueWatching` (already filtered and ordered by
 * recency) and `items` are their resolved details in the same order, so the
 * two zip. The rail renders nothing when resolution produced no items —
 * a rail of blank boxes is worse than no rail.
 */
export function ContinueWatching({
  rows,
  items,
  states,
}: {
  rows: ContinueRow[];
  items: MediaSummary[];
  states?: Map<string, { watched: boolean; inWatchlist: boolean }>;
}) {
  if (items.length === 0) return null;

  // One entry per title: two in-progress episodes of a series share a
  // `mediaKey`, and the newest slot (first row) is the one to show.
  const seen = new Set<string>();
  const unique: MediaSummary[] = [];
  for (const item of items) {
    const key = mediaKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const progress = new Map<string, number>();
  const captions = new Map<string, string>();
  for (const row of rows) {
    const key = mediaKey(row.ref);
    if (captions.has(key)) continue;

    const duration = row.durationSeconds;
    let pct: number | null = null;
    if (duration !== null && duration > 0) {
      progress.set(key, row.positionSeconds / duration);
      pct = Math.round((row.positionSeconds / duration) * 100);
    }

    // A duration-less provider (vidsrc) still resumes; it just cannot say
    // how far in, so the caption drops the figure rather than guessing.
    captions.set(
      key,
      [
        row.season !== null && row.episode !== null
          ? `Resume S${row.season}E${row.episode}`
          : "Resume",
        pct === null ? null : `${pct}%`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  return (
    <PosterGrid
      captions={captions}
      heading="Continue watching"
      items={unique}
      progress={progress}
      states={states}
    />
  );
}
