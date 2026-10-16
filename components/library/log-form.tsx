"use client";

import { useEffect, useOptimistic, useRef, useTransition } from "react";
import type { FormEvent } from "react";
import { StarButtons } from "@/components/library/star-rating";
import type { MediaKind } from "@/lib/media/types";

/**
 * Log one viewing.
 *
 * This is the diary, not the title-level controls above it: it records an
 * entry with its own date and rewatch flag. The score and review it submits
 * are still the title's — the rating table has one row per title — so editing
 * the score here is the same write as the star row above.
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
    // `new FormData(form)` omits the clicked submit button, so a star tap
    // would arrive with no `value` at all — carry it over by hand, same
    // as the title-level StarRating.
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
    <details className="rounded-md border border-border bg-surface-hi">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted hover:text-fg">
        Log a watch
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
            className="w-40 rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg focus:border-accent"
            defaultValue={defaultDate}
            id="log-watched-at"
            name="watchedAt"
            ref={dateRef}
            required
            type="date"
          />
        </label>

        <span className="text-sm text-muted">Score</span>
        <StarButtons name="value" value={null} />

        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent"
          name="body"
          placeholder="What did you think?"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <label className="flex items-center gap-2">
            <input
              defaultChecked={alreadyWatched}
              name="rewatch"
              type="checkbox"
              value="true"
            />
            Rewatch
          </label>
          <label className="flex items-center gap-2">
            <input name="containsSpoilers" type="checkbox" value="true" />
            Contains spoilers
          </label>
        </div>

        <button
          aria-busy={pending}
          className={`self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint${
            pending ? " opacity-60" : ""
          }`}
          type="submit"
        >
          {optimistic ? "Logged ✓" : "Log watch"}
        </button>
        <p className="text-xs text-faint">
          The score and review belong to the title, not this entry — they are
          stored once.
        </p>
      </form>
    </details>
  );
}
