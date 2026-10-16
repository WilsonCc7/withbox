"use client";

import { useTransition } from "react";
import type { FormEvent } from "react";
import { setFavorite } from "@/lib/library/actions";
import type { MediaKind } from "@/lib/media/types";

/**
 * Pick one of the four profile favorite slots, or clear the one this title
 * already holds.
 *
 * Each slot is its own POST form posting the same action: the action's
 * already-a-favorite branch deletes, so the current slot's button doubles as
 * remove. Deliberately knows nothing about the other slots' titles — the
 * profile page owns that.
 *
 * Every slot button posts, so `pending` is shared and disables all four: two
 * slots' posts racing on the (userId, position) unique index is exactly what
 * the server-side move path has to unpick.
 */
export function FavoriteToggle({
  kind,
  tmdbId,
  occupied,
  currentSlot,
}: {
  kind: MediaKind;
  tmdbId: number;
  occupied: boolean[];
  currentSlot: number | null;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await setFavorite(formData);
    });
  }

  return (
    // Same reason as `LogForm`: without an outline the tinted surface reads as
    // a blank field rather than a disclosure.
    <details className="rounded-[var(--radius-control)] border border-border-strong bg-surface-hi">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted transition-colors hover:text-fg">
        Favorites
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        {[0, 1, 2, 3].map((slot) => {
          const current = slot === currentSlot;
          const label = current
            ? `Slot ${slot + 1} — remove`
            : `Slot ${slot + 1} — ${occupied[slot] ? "replace" : "empty"}`;
          return (
            <form
              action={setFavorite}
              key={slot}
              method="post"
              onSubmit={onSubmit}
            >
              <input name="kind" type="hidden" value={kind} />
              <input name="tmdbId" type="hidden" value={tmdbId} />
              <input name="slot" type="hidden" value={slot} />
              <button
                aria-busy={pending}
                aria-pressed={current}
                className={`flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] border bg-surface px-2.5 text-xs text-muted transition-colors hover:border-faint hover:text-fg active:bg-surface-hi disabled:cursor-not-allowed disabled:opacity-60 ${
                  current ? "border-accent" : "border-border-strong"
                }`}
                disabled={pending}
                type="submit"
              >
                {label}
              </button>
            </form>
          );
        })}
      </div>
    </details>
  );
}
