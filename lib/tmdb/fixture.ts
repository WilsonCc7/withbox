/**
 * Fixture transport.
 *
 * Serves the static JSON in `lib/tmdb/fixtures/` through the
 * same `MediaSource` interface as the live transport. Zero
 * network access, deterministic ordering, unknown ids resolve
 * to `null`, unknown queries to an empty page.
 *
 * The JSON keeps TMDB wire field names so `map.ts` is
 * genuinely exercised rather than bypassed.
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
import * as map from "./map";
import fixtureData from "./fixtures/data.json";

interface FixtureStore {
  movies: map.WireMovieDetail[];
  tv: map.WireTvDetail[];
  seasons: Record<string, map.WireEpisodeList>;
  trending: {
    movie: number[];
    tv: number[];
    all: number[];
  };
}

const store = fixtureData as unknown as FixtureStore;

const moviesById = new Map<number, map.WireMovieDetail>(
  store.movies.map((movie) => [movie.id, movie]),
);

const tvById = new Map<number, map.WireTvDetail>(
  store.tv.map((show) => [show.id, show]),
);

function seasonKey(tvId: number, seasonNumber: number): string {
  return `${tvId}/${seasonNumber}`;
}

export function createFixtureSource(): MediaSource {
  return {
    async trending(
      kind: MediaKind | "all",
      _window: TrendingWindow = "day",
    ): Promise<MediaSummary[]> {
      // The fixture set is static, so day and week share one
      // deterministic order; only the id ordering differs per
      // kind, mirroring the live endpoint's per-kind ranking.
      const ids = store.trending[kind];
      return ids.flatMap((id) => {
        const movie = moviesById.get(id);
        if (movie) return [map.mapSummary("movie", movie)];
        const show = tvById.get(id);
        return show ? [map.mapSummary("tv", show)] : [];
      });
    },

    async search(
      query: string,
      scope: SearchScope = "multi",
      page: number = 1,
    ): Promise<Page<MediaSummary>> {
      const needle = query.trim().toLowerCase();
      const pool =
        scope === "movie"
          ? store.movies.map((movie) => map.mapSummary("movie", movie))
          : scope === "tv"
            ? store.tv.map((show) => map.mapSummary("tv", show))
            : [
                ...store.movies.map((movie) =>
                  map.mapSummary("movie", movie),
                ),
                ...store.tv.map((show) => map.mapSummary("tv", show)),
              ];
      // An empty query is no query: it matches nothing rather
      // than everything.
      const matches = needle
        ? pool.filter((item) => item.title.toLowerCase().includes(needle))
        : [];
      const pageSize = 20;
      const start = (page - 1) * pageSize;
      return {
        items: matches.slice(start, start + pageSize),
        page,
        totalPages: Math.max(1, Math.ceil(matches.length / pageSize)),
        totalResults: matches.length,
      };
    },

    async movie(tmdbId: number): Promise<MovieDetail | null> {
      const wire = moviesById.get(tmdbId);
      return wire ? map.mapMovieDetail(wire) : null;
    },

    async tv(tmdbId: number): Promise<TvDetail | null> {
      const wire = tvById.get(tmdbId);
      return wire ? map.mapTvDetail(wire) : null;
    },

    async episodes(
      tvId: number,
      seasonNumber: number,
    ): Promise<Episode[]> {
      const wire = store.seasons[seasonKey(tvId, seasonNumber)];
      return (wire?.episodes ?? []).map(map.mapEpisode);
    },

    async externalIds(): Promise<{ imdbId: string | null }> {
      // No fixture external ids: offline mode makes no upstream calls.
      return { imdbId: null };
    },

    async credits(): Promise<Credits> {
      return { cast: [], crew: [] };
    },
  };
}
