/**
 * framextv adapter.
 *
 * Constructs `https://framextv.xyz/embed/{tmdbId}?autoplay=1&muted=0`
 * for movies. The provider is undocumented: its TV season/episode
 * parameter shape is UNVERIFIED, so rather than guess a URL shape we
 * return `null` for the TV case and let the registry fall through to an
 * adapter that supports episodes.
 *
 * Resume is NOT supported here: the provider has no API surface at all.
 */
import type { Resolution, SourceAdapter } from "./types";

const BASE_URL = "https://framextv.xyz/embed";

export function createFramextvAdapter(): SourceAdapter {
  return {
    name: "framextv",
    label: "FrameTV",
    // No API surface: neither position reporting nor resume.
    resumes: false,

    async resolve(
      tmdbId: number,
      season?: number,
      episode?: number,
      _startAtSeconds?: number, // accepted and ignored: resume unsupported
    ): Promise<Resolution | null> {
      // TV season/episode parameter shape is UNVERIFIED — return null
      // rather than fabricate a URL we cannot vouch for.
      if (season !== undefined || episode !== undefined) {
        return null;
      }
      const url = `${BASE_URL}/${tmdbId}?autoplay=1&muted=0`;
      return { kind: "iframe", url, progress: false };
    },
  };
}
