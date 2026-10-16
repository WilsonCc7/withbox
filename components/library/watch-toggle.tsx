"use client";

import { useOptimistic, useTransition } from "react";
import type { FormEvent } from "react";
import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface WatchToggleProps {
  kind: MediaKind;
  tmdbId: number;
  watched: boolean;
  action: FormAction;
}

/**
 * Optimistic watched toggle.
 *
 * The markup stays a real POST form, so the control still works with
 * JavaScript disabled. With JavaScript the submit is intercepted and the label
 * flips immediately; the server action's revalidation reconciles it. The action
 * arrives as a prop — server actions must not be imported here.
 */
export function WatchToggle({
  kind,
  tmdbId,
  watched,
  action,
}: WatchToggleProps) {
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
        {optimistic ? "✓ Watched" : "Mark watched"}
      </button>
    </form>
  );
}
