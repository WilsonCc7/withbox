/**
 * The metadata contract.
 *
 * Both the live TMDB transport and the fixture transport implement
 * `MediaSource`. Routes and components depend only on these types, never on
 * TMDB's wire format — TMDB field names (which are inconsistent between the
 * movie and TV endpoints) stop at the transport boundary.
 */

export type MediaKind = "movie" | "tv";

export interface Genre {
  id: number;
  name: string;
}

/** Enough to render a card in a grid. */
export interface MediaSummary {
  kind: MediaKind;
  tmdbId: number;
  title: string;
  year: number | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
}

export interface Episode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  runtime: number | null;
  airDate: string | null;
  stillPath: string | null;
}

export interface MovieDetail extends MediaSummary {
  kind: "movie";
  tagline: string | null;
  runtime: number | null;
  releaseDate: string | null;
  genres: Genre[];
}

export interface TvDetail extends MediaSummary {
  kind: "tv";
  tagline: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  /** "Returning Series", "Ended", "Canceled", ... */
  status: string;
  genres: Genre[];
  seasons: Season[];
}

export type MediaDetail = MovieDetail | TvDetail;

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export type TrendingWindow = "day" | "week";

/** `"multi"` searches movies and series together, as the search box does. */
export type SearchScope = MediaKind | "multi";

/**
 * The seam. Implementations must return `null` for a missing title rather than
 * throwing, and must not leak transport errors to callers.
 */
export interface MediaSource {
  trending(
    kind: MediaKind | "all",
    window?: TrendingWindow,
  ): Promise<MediaSummary[]>;

  search(
    query: string,
    scope?: SearchScope,
    page?: number,
  ): Promise<Page<MediaSummary>>;

  movie(tmdbId: number): Promise<MovieDetail | null>;

  tv(tmdbId: number): Promise<TvDetail | null>;

  episodes(tvId: number, seasonNumber: number): Promise<Episode[]>;
}
