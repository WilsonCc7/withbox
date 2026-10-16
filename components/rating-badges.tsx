/**
 * Rating chips for posters and detail heroes.
 *
 * Server component on purpose: no JS, no tooltip library — the source of each
 * number is carried by `title` and by the accessible name. The TMDB chip is
 * the always-available fallback, so a page without an OMDb key (signed out,
 * offline, fixture mode) still shows a score.
 */
export function RatingBadges({
  imdb,
  rt,
  tmdbScore,
  voteCount,
  size,
}: {
  imdb: number | null;
  rt: number | null;
  tmdbScore: number | null;
  voteCount: number | null;
  size: "sm" | "md";
}) {
  if (imdb === null && rt === null && tmdbScore === null) return null;

  const chip =
    size === "sm"
      ? "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold"
      : "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold";
  const tomato = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  const score = tmdbScore === null ? null : tmdbScore.toFixed(1);

  return (
    <span className="inline-flex items-center gap-1">
      {imdb !== null && (
        <span
          aria-label={`IMDb ${imdb.toFixed(1)}`}
          className={`${chip} bg-[#f5c518] text-black`}
          role="img"
          title="IMDb rating"
        >
          <span aria-hidden="true" className="font-bold tracking-tight">
            IMDb
          </span>
          <span aria-hidden="true">{imdb.toFixed(1)}</span>
        </span>
      )}

      {rt !== null && (
        <span
          aria-label={`Rotten Tomatoes ${rt}%`}
          className={`${chip} bg-bg/85 ${rt >= 60 ? "text-[#01b137]" : "text-[#fa320a]"}`}
          role="img"
          title="Rotten Tomatoes"
        >
          <TomatoIcon className={tomato} />
          <span aria-hidden="true">{rt}%</span>
        </span>
      )}

      {imdb === null && score !== null && (
        <span
          aria-label={
            voteCount === null
              ? `TMDB score ${score}`
              : `TMDB score ${score} from ${voteCount} votes`
          }
          className={`${chip} bg-bg/85 text-fg`}
          role="img"
          title="TMDB score"
        >
          <span aria-hidden="true">★ {score}</span>
          {voteCount !== null && (
            <span aria-hidden="true" className="font-normal text-muted">
              ({voteCount})
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function TomatoIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="M12 6.3c-1.1-1-2.9-1.5-4.5-1C4.8 6.2 3.3 8.9 3.6 12c.4 3.9 3.5 7.5 8.4 7.5s8-3.6 8.4-7.5c.3-3.1-1.2-5.8-3.9-6.7-1.6-.5-3.4 0-4.5 1Z"
        fill="currentColor"
      />
      <path
        d="M12 6.3V3.4l3-1.4M12 3.6 9 2.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
