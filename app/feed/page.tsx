import { SiteHeader } from "@/components/site-header";
import { FeedList } from "@/components/social/feed-list";
import { buildFeedRows } from "@/lib/social/feed-rows";
import { getActivity } from "@/lib/social/queries";
import { parseActivityCursor } from "@/lib/social/types";
import { currentUser } from "@/lib/session";

export default async function FeedPage({
 searchParams,
}: {
 searchParams: Promise<{ before?: string }>;
}) {
 const user = await currentUser();
 const { before: rawBefore } = await searchParams;
 const parsed = parseActivityCursor(rawBefore);
 const before = parsed ? { at: new Date(parsed.at), id: parsed.id } : undefined;

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
 const rows = await buildFeedRows(page.items);
 const next = page.next ? `${page.next.at.getTime()}-${page.next.id}` : null;

 return (
  <>
   <SiteHeader />
   <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
    <h1 className="mb-2 text-xl font-semibold text-fg">Feed</h1>
    <p className="mb-6 text-muted">
     Activity from you and the people you follow.
    </p>
    {rows.length === 0 ? (
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
      <FeedList initialRows={rows} initialNext={next} />
      {/* Pointless on the first page: the link would reload this same view. */}
      {before && (
       <div className="mt-6 flex items-center gap-4">
        <a className="text-sm text-accent hover:text-accent-hi" href="/feed">
         Back to the top
        </a>
       </div>
      )}
     </>
    )}
   </main>
  </>
 );
}
