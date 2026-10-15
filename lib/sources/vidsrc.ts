/**
 * vidsrc adapter.
 *
 * Embeds at `/embed/movie/{tmdbId}` and
 * `/embed/tv/{tmdbId}/{season}/{episode}`. Accepts TMDB ids (or IMDb);
 * we only ever pass TMDB. The embed posts `PLAYER_EVENT`/`player_progress`
 * and documents a `?startAt=` resume parameter. Honest status: the
 * parameter name comes from that documented resume support, but the
 * unit is ASSUMED to be seconds and has not been verified against the
 * live embed.
 */
import type { Resolution, SourceAdapter } from "./types";

const BASE_URL = "https://vidsrc.mov/embed";

export function createVidsrcAdapter(): SourceAdapter {
  return {
    name: "vidsrc",
    label: "VidSrc",
    // Documented `?startAt=` resume support.
    resumes: true,

    async resolve(
      tmdbId: number,
      season?: number,
      episode?: number,
      startAtSeconds?: number,
    ): Promise<Resolution | null> {
      let url =
        season === undefined
          ? `${BASE_URL}/movie/${tmdbId}`
          : `${BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
      // The URL has no existing query, so a plain `?startAt=` suffices.
      // Only a positive integer is a meaningful resume hint.
      if (
        startAtSeconds !== undefined &&
        Number.isInteger(startAtSeconds) &&
        startAtSeconds > 0
      ) {
        url = `${url}?startAt=${startAtSeconds}`;
      }
      return { kind: "iframe", url, progress: true };
    },
  };
}
