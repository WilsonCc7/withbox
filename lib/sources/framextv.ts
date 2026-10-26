/**
 * framextv adapter.
 *
 * Constructs `https://framextv.cc/embed/{tmdbId}?autoplay=1&muted=0`
 * for movies. The provider is undocumented: its TV season/episode
 * parameter shape is UNVERIFIED, so rather than guess a URL shape we
 * return `null` for the TV case and let the registry fall through to an
 * adapter that supports episodes.
 *
 * Resume is NOT supported here: the provider has no API surface at all.
 *
 * The `.cc` host is deliberate and not interchangeable with `.xyz`: `.xyz`
 * answers with a 301 to `.cc`, and a redirecting frame loses the permissions
 * the parent `allow` attribute delegates — the browser pins a bare token to
 * the frame's pre-redirect origin. Reproduced: the embed's own fullscreen
 * button throws `Disallowed by permissions policy` from a redirecting frame
 * and works from a direct one. `autoplay` and `picture-in-picture` are dropped
 * the same way.
 */
import type { Resolution, SourceAdapter } from "./types";

const BASE_URL = "https://framextv.cc/embed";

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
