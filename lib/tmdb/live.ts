/**
 * Live TMDB transport.
 *
 * Talks to `https://api.themoviedb.org/3` with an API-key bearer
 * token. The key is passed in — this module never reads the
 * environment.
 *
 * Every request funnels through one `get()`: rate-limited, then
 * read through a KV cache when one is supplied. Only 2xx bodies
 * are cached; a 404 resolves to `null` and is deliberately left
 * uncached so a missing id keeps costing exactly one call. Any
 * other non-2xx throws a `TmdbHttpError` carrying the status.
 */
import type {
  Credits,
  Episode,
  MediaKind,
  MediaSummary,
  MediaSource,
  MovieDetail,
  Page,
  SearchScope,
  TrendingWindow,
  TvDetail,
} from "@/lib/media/types";
import { acquire } from "@/lib/rate-limit";
import type { MediaRef } from "@/lib/library/types";
import { cacheKey, cachedJson } from "./cache";
import * as map from "./map";

const API_BASE = "https://api.themoviedb.org/3";

/** `find/{external_id}` — the two result buckets this call reads. */
interface WireFindResponse {
  movie_results?: map.WireMediaSummary[];
  tv_results?: map.WireMediaSummary[];
}

/** Any non-2xx response other than 404. */
export class TmdbHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`TMDB ${status} for ${path}`);
    this.name = "TmdbHttpError";
    this.status = status;
  }
}

/** How long a response of this shape stays fresh. */
function ttlFor(path: string): number {
  if (path.startsWith("trending/")) return 3600;
  if (path.startsWith("search/")) return 600;
  if (path.endsWith("/external_ids")) return 604800;
  // `find/{imdb_id}` is an id lookup: the answer never changes.
  if (path.startsWith("find/")) return 604800;
  return 86400;
}

export function createLiveSource(
  apiKey: string,
  deps?: { kv?: KVNamespace },
): MediaSource {
  const kv = deps?.kv;

  async function get<T>(
    path: string,
    params?: URLSearchParams,
  ): Promise<T | null> {
    return cachedJson<T | null>(
      kv,
      cacheKey(path, params),
      ttlFor(path),
      async () => {
        await acquire("api.themoviedb.org", 20);
        const url = new URL(`${API_BASE}/${path}`);
        if (params) url.search = params.toString();
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new TmdbHttpError(response.status, path);
        return (await response.json()) as T;
      },
    );
  }

  return {
    async trending(
      kind: MediaKind | "all",
      window: TrendingWindow = "day",
    ): Promise<MediaSummary[]> {
      const data = await get<map.WireListResponse<map.WireMediaSummary>>(
        `trending/${kind}/${window}`,
      );
      const results = data?.results ?? [];
      if (kind === "all") {
        return results.flatMap((wire) => {
          const summary = map.mapMergedSummary(wire);
          return summary ? [summary] : [];
        });
      }
      return results.map((wire) => map.mapSummary(kind, wire));
    },

    async search(
      query: string,
      scope: SearchScope = "multi",
      page = 1,
    ): Promise<Page<MediaSummary>> {
      const params = new URLSearchParams({ query, page: String(page) });
      const data = await get<map.WireListResponse<map.WireMediaSummary>>(
        `search/${scope}`,
        params,
      );
      if (!data) {
        return { items: [], page: 1, totalPages: 0, totalResults: 0 };
      }
      return {
        items: (data.results ?? []).map((wire) =>
          map.mapSearchSummary(scope, wire),
        ),
        page: data.page ?? page,
        totalPages: data.total_pages ?? 0,
        totalResults: data.total_results ?? 0,
      };
    },

    async movie(tmdbId: number): Promise<MovieDetail | null> {
      const wire = await get<map.WireMovieDetail>(`movie/${tmdbId}`);
      return wire ? map.mapMovieDetail(wire) : null;
    },

    async tv(tmdbId: number): Promise<TvDetail | null> {
      const wire = await get<map.WireTvDetail>(`tv/${tmdbId}`);
      return wire ? map.mapTvDetail(wire) : null;
    },

    async episodes(
      tvId: number,
      seasonNumber: number,
    ): Promise<Episode[]> {
      const wire = await get<map.WireEpisodeList>(
        `tv/${tvId}/season/${seasonNumber}`,
      );
      return (wire?.episodes ?? []).map(map.mapEpisode);
    },

    async externalIds(
      kind: MediaKind,
      tmdbId: number,
    ): Promise<{ imdbId: string | null }> {
      const wire = await get<map.WireExternalIds>(
        `${kind}/${tmdbId}/external_ids`,
      );
      return map.mapExternalIds(wire);
    },

    async credits(kind: MediaKind, tmdbId: number): Promise<Credits> {
      const wire = await get<map.WireCredits>(`${kind}/${tmdbId}/credits`);
      return map.mapCredits(kind, wire);
    },

    async recommendations(
      kind: MediaKind,
      tmdbId: number,
    ): Promise<MediaSummary[]> {
      try {
        const wire = await get<map.WireListResponse<map.WireMediaSummary>>(
          `${kind}/${tmdbId}/recommendations`,
        );
        return (wire?.results ?? [])
          .slice(0, 12)
          .map((result) => map.mapSummary(kind, result));
      } catch {
        // The row is decorative: an upstream failure empties it rather
        // than taking the whole detail page down.
        return [];
      }
    },

    async findByImdbId(imdbId: string): Promise<MediaRef | null> {
      const wire = await get<WireFindResponse>(
        `find/${imdbId}`,
        new URLSearchParams({ external_source: "imdb_id" }),
      );
      const movie = wire?.movie_results?.[0];
      if (movie) return { kind: "movie", tmdbId: movie.id };
      const show = wire?.tv_results?.[0];
      return show ? { kind: "tv", tmdbId: show.id } : null;
    },
  };
}
