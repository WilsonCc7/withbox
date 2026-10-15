import { SiteHeader } from "@/components/site-header";
import { ActivityItemRow } from "@/components/social/activity-item";
import { getActivity } from "@/lib/social/queries";
import type { MediaDetail } from "@/lib/media/types";
import type { MediaRef } from "@/lib/library/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

export default async function FeedPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/feed">
              Sign in
            </a>{" "}
            to see the feed.
          </h1>
        </main>
      </>
    );
  }

  const items = await getActivity(user.id);
  const source = mediaSource();

  // Each distinct media ref resolves once, however many rows share it.
  const seen = new Set<string>();
  const refs: MediaRef[] = [];
  for (const item of items) {
    if (item.type === "listed") continue;
    const key = `${item.media.kind}:${item.media.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(item.media);
  }
  const details = await Promise.all(
    refs.map((ref) =>
      ref.kind === "movie"
        ? source.movie(ref.tmdbId)
        : source.tv(ref.tmdbId),
    ),
  );
  const resolved = new Map<string, MediaDetail | null>();
  refs.forEach((ref, i) => {
    resolved.set(`${ref.kind}:${ref.tmdbId}`, details[i]);
  });

  const lookup = (ref: MediaRef) => resolved.get(`${ref.kind}:${ref.tmdbId}`);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <h1 className="mb-2 text-xl font-semibold text-fg">Feed</h1>
        <p className="mb-6 text-muted">
          Activity from you and the people you follow.
        </p>
        {items.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-12 text-center">
            <p className="text-sm text-fg">Nothing here yet.</p>
            <p className="mt-1 text-sm text-muted">
              Follow someone from{" "}
              <a className="text-accent hover:text-accent-hi" href="/people">
                People
              </a>
              , or{" "}
              <a className="text-accent hover:text-accent-hi" href="/">
                watch something
              </a>{" "}
              yourself.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item, i) => {
              const ref = item.type === "listed" ? null : item.media;
              const detail = ref ? lookup(ref) : null;
              return (
                <ActivityItemRow
                  key={`${item.type}-${item.user.id}-${item.at.getTime()}-${i}`}
                  item={item}
                  title={detail ? detail.title : null}
                  href={
                    detail
                      ? detail.kind === "movie"
                        ? `/movie/${detail.tmdbId}`
                        : `/tv/${detail.tmdbId}`
                      : null
                  }
                />
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
