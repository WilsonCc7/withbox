"use client";

import { useOptimistic, useTransition } from "react";
import type { FormEvent } from "react";
import type { MediaKind } from "@/lib/media/types";

/**
 * Optimistic heart.
 *
 * A real POST form, so the control still works with JavaScript disabled; with
 * JavaScript the submit is intercepted and the heart flips immediately, then
 * reconciles on revalidation. The action arrives as a prop — server actions
 * must not be imported into this file.
 */
export function LikeToggle({
  kind,
  tmdbId,
  liked,
  action,
}: {
  kind: MediaKind;
  tmdbId: number;
  liked: boolean;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [optimistic, setOptimistic] = useOptimistic(liked);
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
        aria-label={optimistic ? "Liked" : "Like"}
        aria-pressed={optimistic}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:border-faint active:bg-surface-hi disabled:cursor-not-allowed disabled:opacity-60 ${
          optimistic ? "text-accent" : "text-fg"
        }`}
        disabled={pending}
        type="submit"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill={optimistic ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={optimistic ? 0 : 2}
          viewBox="0 0 24 24"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        {optimistic ? "Liked" : "Like"}
      </button>
    </form>
  );
}
