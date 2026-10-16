/**
 * TMDB wire JSON -> domain types.
 *
 * Field names stay TMDB's so the boundary is explicit; nothing
 * outside `lib/tmdb/` reads them. Every field is optional —
 * TMDB omits them unpredictably.
 */
import type {
  CastMember,
  CreatedBy,
  Credits,
  CrewMember,
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
  created_by?: WireCreatedBy[];
}

export interface WireCreatedBy {
  id: number;
  name: string;
  profile_path?: string | null;
}

/** `external_ids` response. */
export interface WireExternalIds {
  imdb_id?: string | null;
}

export interface WireCastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

export interface WireCrewMember {
  id: number;
  name: string;
  job?: string;
  profile_path?: string | null;
}

/** `movie/{id}/credits` and `tv/{id}/credits` response. */
export interface WireCredits {
  cast?: WireCastMember[];
  crew?: WireCrewMember[];
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
    createdBy: (wire.created_by ?? []).map(
      (person): CreatedBy => ({
        tmdbId: person.id,
        name: person.name,
        profilePath: person.profile_path ?? null,
      }),
    ),
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

/** `""` and missing ids both mean "no IMDb id". */
export function mapExternalIds(
  wire: WireExternalIds | null | undefined,
): { imdbId: string | null } {
  return { imdbId: wire?.imdb_id ? wire.imdb_id : null };
}

const MOVIE_CREW_JOBS = ["Director"];
const TV_CREW_JOBS = ["Writer", "Screenplay", "Creator"];

/** Cast by billing order (max 8 — one full row of the 8-column grid); crew
 * reduced to the roles worth showing. */
export function mapCredits(
  kind: MediaKind,
  wire: WireCredits | null | undefined,
): Credits {
  const cast: CastMember[] = (wire?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 8)
    .map((person) => ({
      tmdbId: person.id,
      name: person.name,
      character: person.character ? person.character : null,
      profilePath: person.profile_path ?? null,
    }));

  const jobs = new Set(kind === "movie" ? MOVIE_CREW_JOBS : TV_CREW_JOBS);
  const seen = new Set<string>();
  const crew: CrewMember[] = [];
  for (const person of wire?.crew ?? []) {
    const job = person.job ?? "";
    const key = `${person.id}:${job}`;
    if (!jobs.has(job) || seen.has(key)) continue;
    seen.add(key);
    crew.push({ tmdbId: person.id, name: person.name, job });
    if (crew.length === 8) break;
  }

  return { cast, crew };
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
