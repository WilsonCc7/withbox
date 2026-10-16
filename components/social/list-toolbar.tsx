import type { MediaKind } from "@/lib/media/types";
import type { ListSummary } from "@/lib/social/types";
import {
  addToList,
  moveListItem,
  removeFromList,
  renameList,
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

/** Owner-only list metadata edit. Posts the whole form, so no JS needed. */
export function RenameListForm({
  listId,
  name,
  description,
}: {
  listId: string;
  name: string;
  description: string | null;
}) {
  return (
    <details className="mt-4 rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted hover:text-fg">
        Edit list
      </summary>
      <form
        action={renameList}
        className="flex flex-col gap-2 border-t border-border p-3"
        method="post"
      >
        <input name="listId" type="hidden" value={listId} />
        <label className="text-sm text-muted" htmlFor="list-name">
          Name
        </label>
        <input
          className="rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg focus:border-accent"
          defaultValue={name}
          id="list-name"
          maxLength={80}
          name="name"
          required
          type="text"
        />
        <label className="text-sm text-muted" htmlFor="list-description">
          Description
        </label>
        <textarea
          className="min-h-16 rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg focus:border-accent"
          defaultValue={description ?? ""}
          id="list-description"
          maxLength={200}
          name="description"
        />
        <button
          className="self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
          type="submit"
        >
          Save
        </button>
      </form>
    </details>
  );
}

/** Nudge one list item up or down; the action swaps positions in one batch. */
export function MoveListItem({ itemId }: { itemId: string }) {
  return (
    <div className="flex items-center gap-1">
      <form action={moveListItem} method="post">
        <input name="itemId" type="hidden" value={itemId} />
        <input name="direction" type="hidden" value="up" />
        <button
          aria-label="Move up"
          className="rounded-md border border-border px-2 py-1 text-xs text-faint transition-colors hover:border-faint hover:text-fg"
          type="submit"
        >
          ↑
        </button>
      </form>
      <form action={moveListItem} method="post">
        <input name="itemId" type="hidden" value={itemId} />
        <input name="direction" type="hidden" value="down" />
        <button
          aria-label="Move down"
          className="rounded-md border border-border px-2 py-1 text-xs text-faint transition-colors hover:border-faint hover:text-fg"
          type="submit"
        >
          ↓
        </button>
      </form>
    </div>
  );
}
