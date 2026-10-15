import { SiteHeader } from "@/components/site-header";
import { ActivityItemRow } from "@/components/social/activity-item";
import { getActivity } from "@/lib/social/queries";
import type { ActivityCursor } from "@/lib/social/types";
import type { MediaDetail } from "@/lib/media/types";
import type { MediaRef } from "@/lib/library/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

/**
 * Cursor wire format: `<epochMillis>-<rowId>`. Split on the FIRST
 * hyphen only — row ids are UUIDs and contain hyphens of their own,
 * so a plain split would tear them apart. Anything malformed means
 * "first page", never an error.
 */
function parseCursor(raw: string | undefined): ActivityCursor | undefined {
 if (raw === undefined) return undefined;
 const split = raw.indexOf("-");
 if (split <= 0) return undefined;
 const at = Number.parseInt(raw.slice(0, split), 10);
 const id = raw.slice(split + 1);
 if (!Number.isFinite(at) || at < 0 || id === "") return undefined;
 return { at: new Date(at), id };
}

export default async function FeedPage({
 searchParams,
}: {
 searchParams: Promise<{ before?: string }>;
}) {
 const user = await currentUser();
 const { before: rawBefore } = await searchParams;
 const before = parseCursor(rawBefore);

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

 const page = await getActivity(user.id, { before });
 const items = page.items;
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
     before ? (
      <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-12 text-center">
       <p className="text-sm text-muted">Nothing older than this.</p>
       <p className="mt-1 text-sm">
        <a className="text-accent hover:text-accent-hi" href="/feed">
         Back to the top
        </a>
       </p>
      </div>
     ) : (
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
     )
    ) : (
     <>
      <ul className="flex flex-col gap-3">
       {items.map((item) => {
        const ref = item.type === "listed" ? null : item.media;
        const detail = ref ? lookup(ref) : null;
        return (
         <ActivityItemRow
          key={item.id}
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
      <div className="mt-6 flex items-center gap-4">
       {/* Pointless on the first page: the link would reload this same view. */}
       {before && (
        <a className="text-sm text-accent hover:text-accent-hi" href="/feed">
         Back to the top
        </a>
       )}
       {page.next && (
        <a
         className="text-sm text-accent hover:text-accent-hi"
         href={`/feed?before=${encodeURIComponent(`${page.next.at.getTime()}-${page.next.id}`)}`}
        >
         Older
        </a>
       )}
      </div>
     </>
    )}
   </main>
  </>
 );
}
