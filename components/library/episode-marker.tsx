"use client";

import { useOptimistic, useTransition } from "react";
import type { FormEvent } from "react";
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

/**
 * Per-episode watched marker. Toggles independently of the season form above
 * it, so the optimistic state is per row: flipping one episode must not touch
 * its siblings' labels.
 */
export function EpisodeMarker({
  kind,
  tmdbId,
  season,
  episode,
  name,
  watched,
  action,
}: EpisodeMarkerProps) {
  const [optimistic, setOptimistic] = useOptimistic(watched);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      await action(formData);
    });
  }

  return (
    <form
      action={action}
      className="flex items-center gap-3"
      method="post"
      onSubmit={onSubmit}
    >
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <input name="season" type="hidden" value={season} />
      <input name="episode" type="hidden" value={episode} />
      <span className="flex-1 text-sm text-fg">
        <span className="text-muted">
          S{season} E{episode}
        </span>{" "}
        · {name}
      </span>
      <button
        aria-busy={pending}
        className="touch-hit cursor-pointer rounded-[var(--radius-control)] border border-border bg-surface px-2 py-1 text-xs text-fg transition-colors hover:border-faint active:bg-surface-hi disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {optimistic ? "✓ Watched" : "Mark watched"}
      </button>
    </form>
  );
}
