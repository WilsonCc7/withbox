"use client";

import { startTransition, useState, useOptimistic } from "react";
import { toggleWatched, toggleWatchlist } from "@/lib/library/actions";
import type { MediaKind } from "@/lib/media/types";

interface CardState {
 watched: boolean;
 inWatchlist: boolean;
}

/**
 * Poster-card quick actions.
 *
 * The card renders these as a sibling of its anchor, never inside it: a
 * `<button>` in an `<a>` is invalid HTML and the click would navigate as well
 * as toggle. Hidden until the card is hovered or focused so a grid
 * of posters stays clean — an already-active button stays visible.
 *
 * `toggleWatched`/`toggleWatchlist` are toggles, so the client sends identity
 * only (kind, tmdbId); absent season/episode parse as null server-side.
 */
export function CardQuickActions({
 kind,
 tmdbId,
 watched,
 inWatchlist,
}: {
 kind: MediaKind;
 tmdbId: number;
 watched: boolean;
 inWatchlist: boolean;
}) {
 const [state, patch] = useOptimistic(
  { watched, inWatchlist },
  (prev: CardState, next: Partial<CardState>) => ({ ...prev, ...next }),
 );
 // Disables the tapped control only: the pair shares one guard, but the
 // other button must not flash its hover-only opacity while it is in flight.
 const [pendingField, setPendingField] = useState<keyof CardState | null>(null);

 function submit(field: keyof CardState, action: (formData: FormData) => Promise<void>) {
  if (pendingField) return;
  setPendingField(field);
  const data = new FormData();
  data.set("kind", kind);
  data.set("tmdbId", String(tmdbId));
  // Async transition: the optimistic value holds until the action resolves
  // and the revalidated props arrive.
  startTransition(async () => {
   patch(
    field === "watched"
     ? { watched: !state.watched }
     : { inWatchlist: !state.inWatchlist },
   );
   try {
    await action(data);
   } finally {
    setPendingField(null);
   }
  });
 }

 const base =
  "touch-hit flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-bg/85 text-fg backdrop-blur transition hover:border-faint hover:bg-surface-hi active:scale-95 disabled:cursor-not-allowed disabled:opacity-60";
 const active = "border-accent text-accent";
 // Hover-only reveal would hide these entirely on touch: Tailwind gates
 // `hover:`/`group-hover:` behind `@media (hover: hover)`, which a coarse
 // pointer never matches. `pointer-coarse` keeps them visible where there is
 // no hover to reveal them with.
 const hidden =
  "opacity-0 pointer-coarse:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100";

 // gap-3, not gap-1.5: `.touch-hit` expands each button by 12px, and at a 6px
 // gap the first button's expansion covered the second's left edge.
 return (
  <div className="absolute right-2 top-2 flex gap-3">
   <button
    aria-label={state.watched ? "Watched" : "Mark watched"}
    aria-pressed={state.watched}
    className={`${base} ${state.watched ? active : hidden}`}
    disabled={pendingField === "watched"}
    onClick={() => submit("watched", toggleWatched)}
    type="button"
   >
    <svg
     aria-hidden="true"
     className="h-4 w-4"
     fill="none"
     stroke="currentColor"
     strokeLinecap="round"
     strokeLinejoin="round"
     strokeWidth="2"
     viewBox="0 0 24 24"
    >
     <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
     <circle cx="12" cy="12" r="3" />
    </svg>
   </button>

   <button
    aria-label={state.inWatchlist ? "In watchlist" : "Add to watchlist"}
    aria-pressed={state.inWatchlist}
    className={`${base} ${state.inWatchlist ? active : hidden}`}
    disabled={pendingField === "inWatchlist"}
    onClick={() => submit("inWatchlist", toggleWatchlist)}
    type="button"
   >
    <svg
     aria-hidden="true"
     className="h-4 w-4"
     fill="none"
     stroke="currentColor"
     strokeLinecap="round"
     strokeLinejoin="round"
     strokeWidth="2"
     viewBox="0 0 24 24"
    >
     <path d="M6.5 3h11a1 1 0 0 1 1 1v16.5L12 17l-6.5 3.5V4a1 1 0 0 1 1-1Z" />
    </svg>
   </button>
  </div>
 );
}
