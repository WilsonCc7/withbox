import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import {
  MoveListItem,
  RemoveFromList,
  RenameListForm,
} from "@/components/social/list-toolbar";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { deleteList } from "@/lib/social/actions";
import { getCardStates } from "@/lib/library/queries";
import { getListById, isListOwner } from "@/lib/social/queries";
import { currentUser } from "@/lib/session";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const list = await getListById(id);
  const user = await currentUser();

  if (!list) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            No such list.{" "}
            <a className="text-accent hover:text-accent-hi" href="/lists">
              Back to lists
            </a>
          </h1>
        </main>
      </>
    );
  }

  const owner = await isListOwner(id, user?.id ?? "");
  const source = mediaSource();

  // Raw resolutions keep their index alignment with `list.items`,
  // so the owner controls can show a title even when a detail
  // is null. getCardStates is three watch-state statements plus one
  // watchlist statement per 60-ref chunk. No OMDb call: a cold browse
  // grid must not fan out — cards show the TMDB chip. Owner only;
  // visitors render plain cards.
  const details = await Promise.all(
    list.items.map(async (ref) =>
      ref.kind === "movie" ? await source.movie(ref.tmdbId) : await source.tv(ref.tmdbId),
    ),
  );
  const cardStates =
    owner && user ? await getCardStates(user.id, list.items) : new Map();

  const overlays = owner && user ? { states: cardStates } : undefined;
  const items = details.filter(
    (item): item is MediaDetail => item !== null,
  );
  const titleCount = `${items.length} title${items.length === 1 ? "" : "s"}`;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <h1 className="text-xl font-semibold text-fg">{list.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <a className="text-accent hover:text-accent-hi" href={`/u/${list.owner.id}`}>
            {list.owner.name}
          </a>{" "}
          · {titleCount}
        </p>
        {list.description !== null && (
          <p className="mt-2 max-w-2xl text-sm text-muted">{list.description}</p>
        )}

        {owner && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RenameListForm
              listId={list.id}
              name={list.name}
              description={list.description}
            />
            <form action={deleteList} method="post">
              <input name="listId" type="hidden" value={list.id} />
              <button
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-danger transition-colors hover:border-faint"
                type="submit"
              >
                Delete list
              </button>
            </form>
          </div>
        )}

        {items.length === 0 ? (
          <p className="mt-8 text-muted">This list is empty.</p>
        ) : (
          <div className="mt-6">
            <PosterGrid
              items={items}
              states={overlays?.states}
            />
            {owner && (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {list.items.map((item, index) => (
                  <li
                    key={`controls-${item.id}`}
                    className="flex items-center gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {details[index]?.title ?? `${item.kind} ${item.tmdbId}`}
                    </span>
                    <MoveListItem itemId={item.id} />
                    <RemoveFromList
                      kind={item.kind}
                      listId={list.id}
                      tmdbId={item.tmdbId}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </>
  );
}
