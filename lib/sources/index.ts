/**
 * The stream-source registry.
 *
 * `SOURCES` is the try-order: the first adapter that returns a
 * non-null resolution wins. `resolveStream` contains every adapter —
 * one that throws is caught and the next is still tried, so a single
 * misbehaving provider can never break playback or starve the others.
 *
 * Input validation lives here, at the seam boundary: a non-integer or
 * non-positive `tmdbId`, or a TV request with `episode` but no
 * `season`, resolves to `null` before any adapter runs.
 */
import { createFramextvAdapter } from "./framextv";
import { createVidlinkAdapter } from "./vidlink";
import { createVidsrcAdapter } from "./vidsrc";
import type { Resolution, SourceAdapter } from "./types";

/** Adapters in try-order. First non-null resolution wins. */
export const SOURCES: SourceAdapter[] = [
  createFramextvAdapter(),
  createVidlinkAdapter(),
  createVidsrcAdapter(),
];

/** Look up an adapter by its `name` (e.g. "vidlink"). */
export function findAdapter(name: string): SourceAdapter | undefined {
  return SOURCES.find((adapter) => adapter.name === name);
}

export interface StreamResult {
  adapter: SourceAdapter;
  resolution: Resolution;
}

/**
 * Resolve the first playable stream for a title. Tries each adapter in
 * `SOURCES` order, contains per-adapter failures, and returns the first
 * non-null resolution — or `null` when nothing supports the request.
 */
export async function resolveStream(
  tmdbId: number,
  season?: number,
  episode?: number,
): Promise<StreamResult | null> {
  const validId = Number.isInteger(tmdbId) && tmdbId > 0;
  const validTv = episode === undefined || season !== undefined;
  if (!validId || !validTv) {
    return null;
  }

  for (const adapter of SOURCES) {
    try {
      const resolution = await adapter.resolve(tmdbId, season, episode);
      if (resolution !== null) {
        return { adapter, resolution };
      }
    } catch {
      // This adapter failed; try the next one.
    }
  }
  return null;
}
