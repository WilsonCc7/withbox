import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface StarRatingProps {
  kind: MediaKind;
  tmdbId: number;
  /** Half-stars 1..10 (10 = five stars), or null for unrated. */
  value: number | null;
  action: FormAction;
}

/** Material star, 24x24 viewBox. */
const STAR_PATH =
  "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/** Star glyphs for `n` half-stars: 7 → "★★★½☆". */
function stars(n: number): string {
  const filled = Math.floor(n / 2);
  const half = n % 2 === 1;
  return "★".repeat(filled) + (half ? "½" : "") + "☆".repeat(5 - filled - (half ? 1 : 0));
}

/** Half of a star: `right` shows the right half, otherwise the left. */
function StarHalf({
  half,
  value,
  active,
}: {
  half: "left" | "right";
  value: number;
  active: boolean;
}) {
  return (
    <button
      aria-label={`Rate ${value / 2} star${value === 2 ? "" : "s"}`}
      className={`h-5 w-2.5 overflow-hidden transition-colors ${
        active ? "text-accent" : "text-faint hover:text-accent"
      }`}
      name="value"
      type="submit"
      value={value}
    >
      <svg
        aria-hidden="true"
        className={half === "right" ? "-translate-x-2.5" : undefined}
        fill="currentColor"
        height="20"
        viewBox="0 0 24 24"
        width="20"
      >
        <path d={STAR_PATH} />
      </svg>
    </button>
  );
}

export function StarRating({ kind, tmdbId, value, action }: StarRatingProps) {
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <form action={action} method="post" className="inline-flex">
        <input name="kind" type="hidden" value={kind} />
        <input name="tmdbId" type="hidden" value={tmdbId} />
        <span className="inline-flex" role="group" aria-label="Star rating">
          {Array.from({ length: 5 }, (_, i) => {
            // Star i covers half-star values 2i+1 (left half) and
            // 2i+2 (right half). Each half is its own submit button;
            // the 20px star inside a 10px-wide clipped button makes
            // the pair render as one star with a pixel-exact split.
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            return (
              <span className="inline-flex" key={i}>
                <StarHalf
                  active={value != null && value >= left}
                  half="left"
                  value={left}
                />
                <StarHalf
                  active={value != null && value >= right}
                  half="right"
                  value={right}
                />
              </span>
            );
          })}
        </span>
      </form>
      {value != null && (
        <span className="text-sm text-muted">
          <span aria-hidden="true">{stars(value)}</span> {value / 2} / 5
        </span>
      )}
      {value != null && (
        <form action={action} method="post" className="inline-block">
          <input name="kind" type="hidden" value={kind} />
          <input name="tmdbId" type="hidden" value={tmdbId} />
          <button
            aria-label="Clear rating"
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-faint transition-colors hover:border-faint hover:text-fg"
            name="value"
            type="submit"
            value=""
          >
            Clear
          </button>
        </form>
      )}
    </div>
  );
}
