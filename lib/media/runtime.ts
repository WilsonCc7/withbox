import { env } from "@/lib/env";
import type { MediaSource } from "@/lib/media/types";
import { getMediaSource } from "@/lib/tmdb";

/**
 * Single place where the media transport is chosen. Everything else takes a
 * `MediaSource` as a parameter, so tests and previews can substitute one.
 *
 * With no API key configured this resolves to the fixture source, which is why
 * `pnpm run build` can prerender without network access.
 */
export function mediaSource(): MediaSource {
  return getMediaSource(env());
}
