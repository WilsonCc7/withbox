import { createList } from "@/lib/social/actions";

export function CreateListForm() {
  return (
    <form action={createList} method="post" className="flex flex-col gap-2">
      <label className="text-sm text-muted" htmlFor="list-name">
        List name
      </label>
      <input
        className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent"
        id="list-name"
        maxLength={80}
        name="name"
        placeholder="Comfort films"
        required
        type="text"
      />
      <label className="text-sm text-muted" htmlFor="list-description">
        Description <span className="text-faint">(optional)</span>
      </label>
      <input
        className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent"
        id="list-description"
        maxLength={200}
        name="description"
        placeholder="Films I rewatch when I need a lift"
        type="text"
      />
      <button
        className="self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-faint"
        type="submit"
      >
        Create list
      </button>
    </form>
  );
}
