/**
 * vidlink adapter.
 *
 * TMDB-native embeds: `/movie/{tmdbId}` and
 * `/tv/{tmdbId}/{season}/{episode}`. The embed posts playback position
 * back, so the app can resume and auto-advance.
 *
 * Resume is NOT supported here: the embed reports position, but we have
 * no documented resume parameter — none is invented.
 */
import type { Resolution, SourceAdapter } from "./types";

const BASE_URL = "https://vidlink.pro";

export function createVidlinkAdapter(): SourceAdapter {
  return {
    name: "vidlink",
    label: "VidLink",
    // Reports position, but no documented resume parameter exists.
    resumes: false,

    async resolve(
      tmdbId: number,
      season?: number,
      episode?: number,
      _startAtSeconds?: number, // accepted and ignored: resume unsupported
    ): Promise<Resolution | null> {
      const url =
        season === undefined
          ? `${BASE_URL}/movie/${tmdbId}`
          : `${BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
      return { kind: "iframe", url, progress: true };
    },
  };
}
