import type { MediaSummary } from "@/lib/media/types";
import { imageUrl } from "@/lib/media/images";

const POSTER_WIDTH = 342;
const POSTER_HEIGHT = 513;

export function MediaCard({ item }: { item: MediaSummary }) {
  const href = item.kind === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
  const poster = imageUrl(item.posterPath, "w342");

  return (
    <a
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface transition-colors hover:border-faint"
      href={href}
    >
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
        {item.kind === "tv" && (
          <span className="absolute left-2 top-2 rounded bg-bg/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Series
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="text-sm font-semibold leading-snug text-fg">{item.title}</h3>
        <p className="text-xs text-muted">
          {[item.year, item.voteAverage != null ? item.voteAverage.toFixed(1) : null]
            .filter(Boolean)
            .join(" · ") || "\u00A0"}
        </p>
      </div>
    </a>
  );
}
