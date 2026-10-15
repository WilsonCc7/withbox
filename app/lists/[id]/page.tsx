import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { RemoveFromList } from "@/components/social/list-toolbar";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { deleteList } from "@/lib/social/actions";
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

  const items = (
    await Promise.all(
      list.items.map(async (ref) =>
        ref.kind === "movie" ? await source.movie(ref.tmdbId) : await source.tv(ref.tmdbId),
      ),
    )
  ).filter((item): item is MediaDetail => item !== null);

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
          <form action={deleteList} method="post" className="mt-4">
            <input name="listId" type="hidden" value={list.id} />
            <button
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-danger transition-colors hover:border-faint"
              type="submit"
            >
              Delete list
            </button>
          </form>
        )}

        {items.length === 0 ? (
          <p className="mt-8 text-muted">This list is empty.</p>
        ) : (
          <div className="mt-6">
            <PosterGrid items={items} />
            {owner && (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {items.map((item) => (
                  <li
                    key={`remove-${item.kind}-${item.tmdbId}`}
                    className="flex items-center gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {item.title}
                    </span>
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
