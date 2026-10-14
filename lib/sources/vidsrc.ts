/**
 * vidsrc adapter.
 *
 * Embeds at `/embed/movie/{tmdbId}` and
 * `/embed/tv/{tmdbId}/{season}/{episode}`. Accepts TMDB ids (or IMDb);
 * we only ever pass TMDB. The embed posts `PLAYER_EVENT`/`player_progress`
 * and supports `?startAt=` resume, so progress is tracked.
 */
import type { Resolution, SourceAdapter } from "./types";

const BASE_URL = "https://vidsrc.mov/embed";

export function createVidsrcAdapter(): SourceAdapter {
  return {
    name: "vidsrc",
    label: "VidSrc",

    async resolve(tmdbId: number, season?: number, episode?: number): Promise<Resolution | null> {
      const url =
        season === undefined
          ? `${BASE_URL}/movie/${tmdbId}`
          : `${BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
      return { kind: "iframe", url, progress: true };
    },
  };
}
