import { PosterGrid } from "@/components/poster-grid";
import { SiteHeader } from "@/components/site-header";
import { mediaSource } from "@/lib/media/runtime";

export const revalidate = 300;

export default async function Home() {
  const source = mediaSource();
  const [films, series] = await Promise.all([
    source.trending("movie", "week"),
    source.trending("tv", "week"),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <PosterGrid heading="Trending films" items={films} />
        <PosterGrid heading="Trending series" items={series} />
      </main>
    </>
  );
}
