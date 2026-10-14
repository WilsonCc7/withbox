/**
 * Live TMDB transport.
 *
 * Talks to `https://api.themoviedb.org/3` with an API-key bearer
 * token. The key is passed in — this module never reads the
 * environment. A 404 resolves to `null` (missing title); any other
 * non-2xx throws a `TmdbHttpError` carrying the status.
 */
import type {
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
import * as map from "./map";

const API_BASE = "https://api.themoviedb.org/3";

/** Any non-2xx response other than 404. */
export class TmdbHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`TMDB ${status} for ${path}`);
    this.name = "TmdbHttpError";
    this.status = status;
  }
}

export function createLiveSource(apiKey: string): MediaSource {
  async function get<T>(
    path: string,
    params?: URLSearchParams,
  ): Promise<T | null> {
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
  };
}
