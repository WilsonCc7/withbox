import type { MediaKind } from "@/lib/media/types";
import type { ListSummary } from "@/lib/social/types";
import {
  addToList,
  removeFromList,
} from "@/lib/social/actions";

export function AddToList({
  listId,
  kind,
  tmdbId,
}: {
  listId: string;
  kind: MediaKind;
  tmdbId: number;
}) {
  return (
    <form action={addToList} method="post">
      <input name="listId" type="hidden" value={listId} />
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <button
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        Add to list
      </button>
    </form>
  );
}

export function RemoveFromList({
  listId,
  kind,
  tmdbId,
}: {
  listId: string;
  kind: MediaKind;
  tmdbId: number;
}) {
  return (
    <form action={removeFromList} method="post">
      <input name="listId" type="hidden" value={listId} />
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <button
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        Remove
      </button>
    </form>
  );
}

/** Signed-in user's picker for "add this title to one of my lists". */
export function AddToListPicker({
  lists,
  kind,
  tmdbId,
}: {
  lists: ListSummary[];
  kind: MediaKind;
  tmdbId: number;
}) {
  return (
    <form action={addToList} method="post" className="flex items-center gap-2">
      <label className="text-sm text-muted" htmlFor="add-to-list">
        Add to list
      </label>
      <select
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg focus:border-accent"
        id="add-to-list"
        name="listId"
      >
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
      <input name="kind" type="hidden" value={kind} />
      <input name="tmdbId" type="hidden" value={tmdbId} />
      <button
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        Add to list
      </button>
      <a className="text-xs text-accent hover:text-accent-hi" href="/lists">
        New list
      </a>
    </form>
  );
}
