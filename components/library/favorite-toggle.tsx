"use client";

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
  return (
    <details className="rounded-md border border-border bg-surface-hi">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted hover:text-fg">
        Favorites
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        {[0, 1, 2, 3].map((slot) => {
          const current = slot === currentSlot;
          const label = current
            ? `Slot ${slot + 1} — remove`
            : `Slot ${slot + 1} — ${occupied[slot] ? "replace" : "empty"}`;
          return (
            <form action={setFavorite} key={slot} method="post">
              <input name="kind" type="hidden" value={kind} />
              <input name="tmdbId" type="hidden" value={tmdbId} />
              <input name="slot" type="hidden" value={slot} />
              <button
                aria-pressed={current}
                className={`rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors hover:border-faint ${
                  current ? "text-accent" : "text-muted"
                }`}
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
