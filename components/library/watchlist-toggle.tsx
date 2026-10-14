import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface WatchlistToggleProps {
  kind: MediaKind;
  tmdbId: number;
  inWatchlist: boolean;
  action: FormAction;
}

export function WatchlistToggle({
  kind,
  tmdbId,
  inWatchlist,
  action,
}: WatchlistToggleProps) {
  return (
    <form action={action} method="post" className="inline-block">
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <button
        className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        {inWatchlist ? "✓ In watchlist" : "Add to watchlist"}
      </button>
    </form>
  );
}
