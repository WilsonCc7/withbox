export type FormAction = (formData: FormData) => void | Promise<void>;

interface MarkSeasonFormProps {
  tmdbId: number;
  season: number;
  /** Episode numbers to mark, e.g. [1,2,3] for a three-episode season. */
  episodes: number[];
  action: FormAction;
}

export function MarkSeasonForm({
  tmdbId,
  season,
  episodes,
  action,
}: MarkSeasonFormProps) {
  return (
    <form action={action} method="post" className="inline-block">
      {/* Seasons only exist for series. */}
      <input name="kind" type="hidden" value="tv" />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <input name="season" type="hidden" value={season} />
      <input name="episodes" type="hidden" value={episodes.join(",")} />
      <button
        className="inline-block rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg transition-colors hover:border-faint"
        type="submit"
      >
        Mark season {season} watched ({episodes.length} episode
        {episodes.length === 1 ? "" : "s"})
      </button>
    </form>
  );
}
