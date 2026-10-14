/**
 * TMDB image CDN.
 *
 * `path` is the API's `poster_path` / `backdrop_path` / `still_path`.
 * Sizes used by the UI: posters `w342`/`w500`, stills `w300`, backdrops `w1280`.
 * Requesting a fixed size keeps a 2000px asset out of a 180px card.
 */
const CDN = "https://image.tmdb.org/t/p";

export function imageUrl(path: string | null, size: string): string | null {
  return path ? `${CDN}/${size}${path}` : null;
}
