import { imageUrl } from "@/lib/media/images";

/** Star glyphs for `n` half-stars: 7 → "★★★½☆". */
function stars(n: number): string {
  const filled = Math.floor(n / 2);
  const half = n % 2 === 1;
  return "★".repeat(filled) + (half ? "½" : "") + "☆".repeat(5 - filled - (half ? 1 : 0));
}

/**
 * One diary entry, shared by /diary and the profile's recent strip.
 *
 * `watchedAt` arrives preformatted (YYYY-MM-DD): the database stores a
 * timestamp and converting it here would drift by a day across timezones.
 */
export function DiaryRow({
  href,
  title,
  posterPath,
  season,
  episode,
  watchedAt,
  rewatch,
  rating,
  excerpt,
  canDelete,
  deleteAction,
  entryId,
}: {
  href: string;
  title: string;
  posterPath: string | null;
  season: number | null;
  episode: number | null;
  watchedAt: string;
  rewatch: boolean;
  rating: number | null;
  excerpt: string | null;
  canDelete: boolean;
  deleteAction?: (fd: FormData) => void | Promise<void>;
  entryId?: string;
}) {
  const poster = imageUrl(posterPath, "w92");

  return (
    <div className="flex gap-3 border-b border-border py-3">
      <a className="shrink-0" href={href}>
        {poster ? (
          <img
            alt=""
            className="h-[60px] w-10 rounded bg-surface-hi object-cover"
            height={60}
            src={poster}
            width={40}
          />
        ) : (
          <div className="h-[60px] w-10 rounded bg-surface-hi" />
        )}
      </a>

      {/* min-w-0 lets a long title or excerpt wrap instead of pushing the
          row past the viewport on a 375px phone. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <a className="text-sm font-medium text-fg hover:text-accent" href={href}>
            {title}
          </a>
          {season !== null && episode !== null && (
            <span className="text-xs text-muted">
              S{season}E{episode}
            </span>
          )}
          <span className="text-xs text-faint">{watchedAt}</span>
          {rewatch && (
            <span className="rounded border border-border px-1.5 text-[10px] uppercase tracking-wide text-muted">
              Rewatch
            </span>
          )}
        </div>
        {rating !== null && (
          <p aria-label={`Rated ${rating / 2} of 5`} className="mt-1 text-sm text-accent">
            {stars(rating)}
          </p>
        )}
        {excerpt && (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{excerpt}</p>
        )}
      </div>

      {canDelete && deleteAction && entryId && (
        <form action={deleteAction} className="shrink-0" method="post">
          <input name="entryId" type="hidden" value={entryId} />
          <button
            aria-label="Remove from diary"
            className="rounded-md border border-border px-2 py-1 text-xs text-faint transition-colors hover:border-faint hover:text-fg"
            type="submit"
          >
            Remove
          </button>
        </form>
      )}
    </div>
  );
}
