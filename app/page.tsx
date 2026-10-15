import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { getWatched } from "@/lib/library/queries";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

export const revalidate = 300;

export default async function Home() {
  const user = await currentUser();
  const source = mediaSource();
  const [films, series] = await Promise.all([
    source.trending("movie", "week"),
    source.trending("tv", "week"),
  ]);

  let recent: MediaDetail[] = [];
  if (user) {
    const { rows: watched } = await getWatched(user.id, { limit: 12 });
    recent = (
      await Promise.all(
        watched.map(async ({ ref }) =>
          ref.kind === "movie"
            ? await source.movie(ref.tmdbId)
            : await source.tv(ref.tmdbId),
        ),
      )
    ).filter((item): item is MediaDetail => item !== null);
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {recent.length > 0 ? (
          <PosterGrid heading="Recently watched" items={recent} />
        ) : user ? (
          <p className="mb-6 text-muted">
            Welcome back, {user.name}. Mark a film or series watched and it will
            appear here.
          </p>
        ) : null}
        <PosterGrid heading="Trending films" items={films} />
        <PosterGrid heading="Trending series" items={series} />
      </main>
    </>
  );
}
