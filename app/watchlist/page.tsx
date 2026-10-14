import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getWatchlist } from "@/lib/library/queries";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

export default async function WatchlistPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in">
              Sign in
            </a>{" "}
            to keep a watchlist.
          </h1>
        </main>
      </>
    );
  }

  const refs = await getWatchlist(user.id);
  const source = mediaSource();

  const items = (
    await Promise.all(
      refs.map(async (ref) =>
        ref.kind === "movie" ? await source.movie(ref.tmdbId) : await source.tv(ref.tmdbId),
      ),
    )
  ).filter((item): item is MediaDetail => item !== null);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <PosterGrid heading={`Watchlist (${items.length})`} items={items} />
      </main>
    </>
  );
}
