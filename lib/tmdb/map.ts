/**
 * TMDB wire JSON -> domain types.
 *
 * TMDB is inconsistent between endpoints: movies use `title` /
 * `release_date` / `runtime`, TV uses `name` / `first_air_date` /
 * `episode_run_time`, and `vote_average` can be absent on either.
 * Everything is normalised here so nothing downstream ever sees a
 * wire field name.
 */
import type {
  Episode,
  Genre,
  MediaKind,
  MediaSummary,
  MovieDetail,
  SearchScope,
  Season,
  TvDetail,
} from "@/lib/media/types";

/* Wire shapes. Fields are optional: TMDB omits them unpredictably. */

export interface WireMediaSummary {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
}

export interface WireGenre {
  id: number;
  name: string;
}

export interface WireMovieDetail extends WireMediaSummary {
  tagline?: string;
  runtime?: number | null;
  genres?: WireGenre[];
}

export interface WireSeason {
  season_number: number;
  name?: string;
  episode_count?: number;
  air_date?: string | null;
  poster_path?: string | null;
}

export interface WireTvDetail extends WireMediaSummary {
  tagline?: string;
  last_air_date?: string;
  status?: string;
  genres?: WireGenre[];
  seasons?: WireSeason[];
}

export interface WireEpisode {
  id?: number;
  season_number?: number;
  episode_number?: number;
  name?: string;
  overview?: string;
  runtime?: number | null;
  air_date?: string | null;
  still_path?: string | null;
}

/** `tv/{id}/season/{n}` response. */
export interface WireEpisodeList {
  episodes?: WireEpisode[];
}

/** `trending/*` and `search/*` list responses. */
export interface WireListResponse<T> {
  page?: number;
  total_pages?: number;
  total_results?: number;
  results?: T[];
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function mapGenres(genres: WireGenre[] | undefined): Genre[] {
  return (genres ?? []).map((genre) => ({ id: genre.id, name: genre.name }));
}

export function mapSummary(kind: MediaKind, wire: WireMediaSummary): MediaSummary {
  return {
    kind,
    tmdbId: wire.id,
    title: kind === "movie" ? (wire.title ?? "") : (wire.name ?? ""),
    year: yearOf(kind === "movie" ? wire.release_date : wire.first_air_date),
    overview: wire.overview ?? "",
    posterPath: wire.poster_path ?? null,
    backdropPath: wire.backdrop_path ?? null,
    voteAverage: wire.vote_average ?? null,
    voteCount: wire.vote_count ?? null,
  };
}

export function mapMovieDetail(wire: WireMovieDetail): MovieDetail {
  return {
    ...mapSummary("movie", wire),
    kind: "movie",
    tagline: wire.tagline ?? null,
    runtime: wire.runtime ?? null,
    releaseDate: wire.release_date ?? null,
    genres: mapGenres(wire.genres),
  };
}

export function mapTvDetail(wire: WireTvDetail): TvDetail {
  return {
    ...mapSummary("tv", wire),
    kind: "tv",
    tagline: wire.tagline ?? null,
    firstAirDate: wire.first_air_date ?? null,
    lastAirDate: wire.last_air_date ?? null,
    status: wire.status ?? "",
    genres: mapGenres(wire.genres),
    seasons: (wire.seasons ?? []).map(mapSeason),
  };
}

export function mapSeason(wire: WireSeason): Season {
  return {
    seasonNumber: wire.season_number,
    name: wire.name ?? "",
    episodeCount: wire.episode_count ?? 0,
    airDate: wire.air_date ?? null,
    posterPath: wire.poster_path ?? null,
  };
}

export function mapEpisode(wire: WireEpisode): Episode {
  return {
    seasonNumber: wire.season_number ?? 0,
    episodeNumber: wire.episode_number ?? 0,
    name: wire.name ?? "",
    overview: wire.overview ?? "",
    runtime: wire.runtime ?? null,
    airDate: wire.air_date ?? null,
    stillPath: wire.still_path ?? null,
  };
}

/**
 * Merged (`all`) endpoints tag each result with `media_type`;
 * fall back to which title field is present. TV items are keyed
 * by `name`.
 */
function inferKind(wire: WireMediaSummary): MediaKind {
  if (wire.media_type === "tv") return "tv";
  if (wire.media_type === "movie" || wire.title !== undefined) return "movie";
  return "tv";
}

/** `trending/all` also returns people; those are not media. */
export function mapMergedSummary(wire: WireMediaSummary): MediaSummary | null {
  if (wire.media_type === "person") return null;
  return mapSummary(inferKind(wire), wire);
}

export function mapSearchSummary(
  scope: SearchScope,
  wire: WireMediaSummary,
): MediaSummary {
  return mapSummary(scope === "multi" ? inferKind(wire) : scope, wire);
}
