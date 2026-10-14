import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface WatchToggleProps {
  kind: MediaKind;
  tmdbId: number;
  watched: boolean;
  action: FormAction;
}

export function WatchToggle({
  kind,
  tmdbId,
  watched,
  action,
}: WatchToggleProps) {
  return (
    <form action={action} method="post" className="inline-block">
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <button
        className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        {watched ? "✓ Watched" : "Mark watched"}
      </button>
    </form>
  );
}
