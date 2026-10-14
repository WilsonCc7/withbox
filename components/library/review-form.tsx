import type { MediaKind } from "@/lib/media/types";

export type FormAction = (formData: FormData) => void | Promise<void>;

interface ReviewFormProps {
  kind: MediaKind;
  tmdbId: number;
  body: string;
  containsSpoilers: boolean;
  action: FormAction;
}

export function ReviewForm({
  kind,
  tmdbId,
  body,
  containsSpoilers,
  action,
}: ReviewFormProps) {
  return (
    <form action={action} method="post" className="flex flex-col gap-2">
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <label className="text-sm text-muted" htmlFor="review-body">
        Review
      </label>
      <textarea
        className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent"
        defaultValue={body}
        id="review-body"
        name="body"
        placeholder="What did you think?"
      />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          defaultChecked={containsSpoilers}
          name="containsSpoilers"
          type="checkbox"
          value="true"
        />
        Contains spoilers
      </label>
      <button
        className="self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        Save review
      </button>
    </form>
  );
}
