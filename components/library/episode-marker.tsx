import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface EpisodeMarkerProps {
  kind: MediaKind;
  tmdbId: number;
  season: number;
  episode: number;
  name: string;
  watched: boolean;
  action: FormAction;
}

export function EpisodeMarker({
  kind,
  tmdbId,
  season,
  episode,
  name,
  watched,
  action,
}: EpisodeMarkerProps) {
  return (
    <form action={action} method="post" className="flex items-center gap-3">
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <input name="season" type="hidden" value={season} />
      <input name="episode" type="hidden" value={episode} />
      <span className="flex-1 text-sm text-fg">
        <span className="text-muted">S{season} E{episode}</span> · {name}
      </span>
      <button
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg transition-colors hover:border-faint"
        type="submit"
      >
        {watched ? "✓ Watched" : "Mark watched"}
      </button>
    </form>
  );
}
