"use client";

import { useOptimistic, useTransition } from "react";
import type { FormEvent } from "react";
import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface WatchlistToggleProps {
  kind: MediaKind;
  tmdbId: number;
  inWatchlist: boolean;
  action: FormAction;
}

/**
 * Optimistic watchlist toggle. Same contract as WatchToggle: the POST form is
 * the no-JS path, the intercepted submit is the instant one, and the action is
 * a prop rather than an import.
 */
export function WatchlistToggle({
  kind,
  tmdbId,
  inWatchlist,
  action,
}: WatchlistToggleProps) {
  const [optimistic, setOptimistic] = useOptimistic(inWatchlist);
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
      className="inline-block"
      method="post"
      onSubmit={onSubmit}
    >
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <button
        aria-busy={pending}
        className={`inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint${
          pending ? " opacity-60" : ""
        }`}
        type="submit"
      >
        {optimistic ? "✓ In watchlist" : "Add to watchlist"}
      </button>
    </form>
  );
}
