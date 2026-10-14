/**
 * vidlink adapter.
 *
 * TMDB-native embeds: `/movie/{tmdbId}` and
 * `/tv/{tmdbId}/{season}/{episode}`. The embed posts playback position
 * back, so the app can resume and auto-advance.
 */
import type { Resolution, SourceAdapter } from "./types";

const BASE_URL = "https://vidlink.pro";

export function createVidlinkAdapter(): SourceAdapter {
  return {
    name: "vidlink",
    label: "VidLink",

    async resolve(tmdbId: number, season?: number, episode?: number): Promise<Resolution | null> {
      const url =
        season === undefined
          ? `${BASE_URL}/movie/${tmdbId}`
          : `${BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
      return { kind: "iframe", url, progress: true };
    },
  };
}
