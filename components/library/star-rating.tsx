"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { FormEvent } from "react";
import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface StarRatingProps {
 kind: MediaKind;
 tmdbId: number;
 /** Half-stars 1..10 (10 = five stars), or null for unrated. */
 value: number | null;
 action: FormAction;
}

/** Material star, 24x24 viewBox. */
const STAR_PATH =
 "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/** Star glyphs for `n` half-stars: 7 → "★★★½☆". */
function stars(n: number): string {
 const filled = Math.floor(n / 2);
 const half = n % 2 === 1;
 return "★".repeat(filled) + (half ? "½" : "") + "☆".repeat(5 - filled - (half ? 1 : 0));
}

/** Half of a star: `right` shows the right half, otherwise the left. */
function StarHalf({
 half,
 name,
 value,
 active,
 onPreview,
}: {
 half: "left" | "right";
 name: string;
 value: number;
 active: boolean;
 onPreview: (value: number) => void;
}) {
 return (
  <button
   aria-label={`Rate ${value / 2} star${value === 2 ? "" : "s"}`}
   className={`touch-hit-y h-5 w-2.5 transition-colors ${active ? "text-accent" : "text-faint hover:text-accent"
    }`}
   name={name}
   onMouseEnter={() => onPreview(value)}
   type="submit"
   value={value}
  >
   {/*
       * The clip lives on this inner box, not on the button: `overflow: hidden`
       * on the button would clip its own ::before hit-area away with it.
       */}
   <span className="block h-5 w-2.5 overflow-hidden">
    <svg
     aria-hidden="true"
     className={half === "right" ? "-translate-x-2.5" : undefined}
     fill="currentColor"
     height="20"
     viewBox="0 0 24 24"
     width="20"
    >
     <path d={STAR_PATH} />
    </svg>
   </span>
  </button>
 );
}

/**
 * The ten half-star submit buttons plus a Clear button, with a hover preview.
 *
 * Deliberately form-less and free of hidden inputs: it drops into the title
 * rating form, which supplies `kind`/`tmdbId`. Every button is a plain submit
 * button, so a click and a keyboard Enter take the same path through the form.
 */
export function StarButtons({ value, name }: { value: number | null; name: string }) {
 // The previewed half-star while the pointer is over the row. Cleared on
 // leave and on touch so a tap never leaves the row showing a value that was
 // never submitted.
 const [preview, setPreview] = useState<number | null>(null);
 const shown = preview ?? value;

 return (
  <span className="inline-flex items-center gap-2">
   <span
    aria-label="Star rating"
    className="inline-flex"
    onMouseLeave={() => setPreview(null)}
    onTouchStart={() => setPreview(null)}
    role="group"
   >
    {Array.from({ length: 5 }, (_, i) => {
     // Star i covers half-star values 2i+1 (left half) and
     // 2i+2 (right half). Each half is its own submit button;
     // the 20px star inside a 10px-wide clipped button makes
     // the pair render as one star with a pixel-exact split.
     const left = 2 * i + 1;
     const right = 2 * i + 2;
     return (
      <span className="inline-flex" key={i}>
       <StarHalf
        active={shown != null && shown >= left}
        half="left"
        name={name}
        onPreview={setPreview}
        value={left}
       />
       <StarHalf
        active={shown != null && shown >= right}
        half="right"
        name={name}
        onPreview={setPreview}
        value={right}
       />
      </span>
     );
    })}
   </span>
   {value != null && (
    <button
     aria-label="Clear rating"
     className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-faint transition-colors hover:border-faint hover:text-fg"
     name={name}
     type="submit"
     value=""
    >
     Clear
    </button>
   )}
  </span>
 );
}

/**
 * Title-level rating control. `setRating` already reads "" and "0" as a clear,
 * so the Clear button submits the same `value` field with no special casing.
 */
export function StarRating({ kind, tmdbId, value, action }: StarRatingProps) {
 const [optimistic, setOptimistic] = useOptimistic(value);
 const [pending, startTransition] = useTransition();

 function onSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  const formData = new FormData(form);
  // `new FormData(form)` leaves the pressed submit button out, so the clicked
  // half-star would arrive with no `value` at all — carry it over by hand.
  if (submitter?.name) formData.set(submitter.name, submitter.value);
  const raw = formData.get("value");
  const next =
   raw === null || raw === "" || raw === "0" ? null : Number(raw);
  startTransition(async () => {
   setOptimistic(next);
   await action(formData);
  });
 }

 return (
  <div className="inline-flex flex-wrap items-center gap-2">
   <span className="text-sm text-muted">Your rating</span>
   <form
    action={action}
    className="inline-flex"
    method="post"
    onSubmit={onSubmit}
   >
    <input name="kind" type="hidden" value={kind} />
    <input name="tmdbId" type="hidden" value={tmdbId} />
    <StarButtons name="value" value={optimistic} />
   </form>
   {optimistic != null && (
    <span
     aria-busy={pending}
     className={`text-sm text-muted${pending ? " opacity-60" : ""}`}
    >
     <span aria-hidden="true">{stars(optimistic)}</span> {optimistic / 2} / 5
    </span>
   )}
  </div>
 );
}
