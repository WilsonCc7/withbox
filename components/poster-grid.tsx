import type { MediaSummary } from "@/lib/media/types";
import { MediaCard } from "@/components/media-card";

export function PosterGrid({
  items,
  heading,
}: {
  items: MediaSummary[];
  heading?: string;
}) {
  return (
    <section>
      {heading && (
        <h2 className="mb-4 text-xl font-semibold text-fg">{heading}</h2>
      )}
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-muted">
          Nothing here yet.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <li key={`${item.kind}-${item.tmdbId}`}>
              <MediaCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
