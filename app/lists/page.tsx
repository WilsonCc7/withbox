import { SiteHeader } from "@/components/site-header";
import { CreateListForm } from "@/components/social/create-list-form";
import { mediaKey } from "@/lib/library/types";
import type { MediaRef } from "@/lib/library/types";
import { imageUrl } from "@/lib/media/images";
import { getListsByUser } from "@/lib/social/queries";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

export default async function ListsPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/lists">
              Sign in
            </a>{" "}
            to keep lists.
          </h1>
        </main>
      </>
    );
  }

  const lists = await getListsByUser(user.id);

  // Cover thumbs: resolve every list's first item in one
  // mediaSource() batch over the distinct refs (lists can
  // share a cover title), not one call per card.
  const seen = new Set<string>();
  const distinctRefs: MediaRef[] = [];
  for (const list of lists) {
    const ref = list.firstItem;
    if (!ref) continue;
    const key = mediaKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    distinctRefs.push(ref);
  }
  const source = mediaSource();
  const covers = new Map(
    (
      await Promise.all(
        distinctRefs.map(async (ref) =>
          [
            mediaKey(ref),
            ref.kind === "movie"
              ? await source.movie(ref.tmdbId)
              : await source.tv(ref.tmdbId),
          ] as const,
        ),
      )
    ).filter(([, detail]) => detail !== null),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold text-fg">My lists</h1>
        <div className="mb-10 max-w-md">
          <CreateListForm />
        </div>
        {lists.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-12 text-center">
            <p className="text-sm text-fg">You have no lists yet.</p>
            <p className="mt-1 text-sm text-muted">
              Lists group titles you want to keep together — your watchlist
              stays separate.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => {
              const cover = list.firstItem
                ? covers.get(mediaKey(list.firstItem)) ?? null
                : null;
              const href = list.firstItem
                ? `/${list.firstItem.kind}/${list.firstItem.tmdbId}`
                : null;
              return (
                <li key={list.id}>
                  <div className="flex h-full gap-3">
                    {href && (
                      <a
                        aria-label={cover?.title ?? "First item"}
                        className="shrink-0 self-start"
                        href={href}
                      >
                        {cover?.posterPath ? (
                          <img
                            alt={cover.title}
                            className="w-14 rounded-[var(--radius-card)]"
                            loading="lazy"
                            src={imageUrl(cover.posterPath, "w92") ?? undefined}
                          />
                        ) : (
                          <span className="block h-20 w-14 rounded-[var(--radius-card)] bg-surface-hi" />
                        )}
                      </a>
                    )}
                    <a
                      className="flex h-full min-w-0 flex-1 flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-faint"
                      href={`/lists/${list.id}`}
                    >
                      <span className="text-fg font-semibold">{list.name}</span>
                      {list.description !== null && (
                        <span className="truncate text-sm text-muted">
                          {list.description}
                        </span>
                      )}
                      <span className="mt-2 text-xs text-faint">
                        {list.itemCount} title{list.itemCount === 1 ? "" : "s"}
                      </span>
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
