import type { MediaRef } from "@/lib/library/types";
import { mediaSource } from "@/lib/media/runtime";
import type { ActivityItem } from "@/lib/social/types";

export interface FeedRow {
  item: ActivityItem;
  title: string;
  posterPath: string | null;
  href: string;
  userName: string;
}

// Fallback when TMDB has no record for a ref — the row still renders.
const UNKNOWN_TITLE = "Unknown title";

/**
 * Enrich feed items identically for the first page (server render) and later
 * pages (the /api/feed route). Each distinct media ref resolves once, however
 * many rows share it.
 */
export async function buildFeedRows(
  items: ActivityItem[],
): Promise<FeedRow[]> {
  const seen = new Set<string>();
  const refs: MediaRef[] = [];
  for (const item of items) {
    if (item.type === "listed") continue;
    const key = `${item.media.kind}:${item.media.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(item.media);
  }
  const source = mediaSource();
  const details = await Promise.all(
    refs.map((ref) =>
      ref.kind === "movie" ? source.movie(ref.tmdbId) : source.tv(ref.tmdbId),
    ),
  );
  const resolved = new Map<
    string,
    { title: string; posterPath: string | null }
  >();
  refs.forEach((ref, i) => {
    const detail = details[i];
    resolved.set(`${ref.kind}:${ref.tmdbId}`, {
      title: detail?.title ?? UNKNOWN_TITLE,
      posterPath: detail?.posterPath ?? null,
    });
  });

  return items.map((item) => {
    if (item.type === "listed") {
      return {
        item,
        title: item.listName,
        posterPath: null,
        href: `/lists/${item.listId}`,
        userName: item.user.name,
      };
    }
    const media = resolved.get(`${item.media.kind}:${item.media.tmdbId}`) ?? {
      title: UNKNOWN_TITLE,
      posterPath: null,
    };
    return {
      item,
      title: media.title,
      posterPath: media.posterPath,
      href: `/${item.media.kind === "movie" ? "movie" : "tv"}/${item.media.tmdbId}`,
      userName: item.user.name,
    };
  });
}
