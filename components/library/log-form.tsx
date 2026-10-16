"use client";

import { useEffect, useOptimistic, useRef, useTransition } from "react";
import type { FormEvent } from "react";
import type { MediaKind } from "@/lib/media/types";

/**
 * Log one viewing.
 *
 * This is the diary entry only: a date and a rewatch flag. The title-level
 * score and review live in the panel above it, so each of those is editable in
 * exactly one place — the rating table has one row per title, and a second
 * control here wrote the same row with no way to tell which one was being
 * edited.
 *
 * The markup stays a real POST form, so the control works with JavaScript
 * disabled; with JavaScript the submit is intercepted and the label flips
 * optimistically. The action arrives as a prop — server actions must not be
 * imported into this file.
 */
export function LogForm({
  kind,
  tmdbId,
  defaultDate,
  alreadyWatched,
  log,
}: {
  kind: MediaKind;
  tmdbId: number;
  defaultDate: string;
  alreadyWatched: boolean;
  log: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(false);
  const dateRef = useRef<HTMLInputElement>(null);

  // The server renders the UTC date; only the client knows the viewer's zone,
  // so correct it on mount unless they already typed something. `defaultValue`
  // is updated too, so the post-submit `form.reset()` restores the local date.
  useEffect(() => {
    const input = dateRef.current;
    if (!input || input.value !== defaultDate) return;
    input.value = new Date().toLocaleDateString("sv-SE");
    input.defaultValue = input.value;
  }, [defaultDate]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // `new FormData(form)` omits the clicked submit button; carry it over so a
    // named submitter (if one is ever added) still reaches the action.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const formData = new FormData(form);
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(async () => {
      setOptimistic(true);
      await log(formData);
      // A reset (rather than clearing state) restores the date and rewatch
      // defaults, so a second viewing is one click away.
      form.reset();
    });
  }

  return (
    // The panel already draws a border, but this disclosure sits a shade
    // above the panel surface, so on its own it read as a blank input field.
    // The outline names it as a control; the `border-t` below stays a hairline
    // divider, because it separates rather than bounds.
    <details className="rounded-[var(--radius-control)] border border-border-strong bg-surface-hi">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted hover:text-fg">
        Log a viewing
      </summary>
      <form
        action={log}
        className="flex flex-col gap-3 border-t border-border p-3"
        method="post"
        onSubmit={onSubmit}
      >
        <input name="kind" type="hidden" value={kind} />
        <input name="tmdbId" type="hidden" value={tmdbId} />
        <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="log-watched-at">
          Watched on
          <input
            className="w-40 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-accent"
            defaultValue={defaultDate}
            id="log-watched-at"
            name="watchedAt"
            ref={dateRef}
            required
            type="date"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            defaultChecked={alreadyWatched}
            name="rewatch"
            type="checkbox"
            value="true"
          />
          Rewatch
        </label>

        <button
          aria-busy={pending}
          className={`self-start rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint${
            pending ? " opacity-60" : ""
          }`}
          type="submit"
        >
          {optimistic ? "Logged ✓" : "Log watch"}
        </button>
      </form>
    </details>
  );
}
