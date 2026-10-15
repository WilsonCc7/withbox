/**
 * The stream-source registry.
 *
 * `SOURCES` is the try-order. `resolveAll` resolves every adapter that can
 * serve a request and contains per-adapter failures — one that throws is caught
 * and the next is still tried, so a single misbehaving provider can never break
 * playback or starve the others. `pickStream` then chooses between them.
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

export interface StreamResult {
 adapter: SourceAdapter;
 resolution: Resolution;
}

/**
 * Resolve every adapter that can serve this request, in `SOURCES` order.
 *
 * Resolving all of them rather than stopping at the first hit is what lets the
 * player offer a source picker. It is cheap: adapters build a URL and perform
 * no I/O, so this is N string constructions, not N network calls.
 *
 * Per-adapter failures stay contained — a throwing adapter is simply absent
 * from the result instead of breaking playback or starving the others.
 */
export async function resolveAll(
 tmdbId: number,
 season?: number,
 episode?: number,
): Promise<StreamResult[]> {
 const validId = Number.isInteger(tmdbId) && tmdbId > 0;
 const validTv = episode === undefined || season !== undefined;
 if (!validId || !validTv) {
  return [];
 }

 const results: StreamResult[] = [];
 for (const adapter of SOURCES) {
  try {
   const resolution = await adapter.resolve(tmdbId, season, episode);
   if (resolution !== null) {
    results.push({ adapter, resolution });
   }
  } catch {
   // This adapter failed; it just does not appear as an option.
  }
 }
 return results;
}

/**
 * Choose what to play. `preferred` is the `?source=` value.
 *
 * The allowlist is the result list itself: it only ever contains registered
 * adapters that actually resolved this request, so an unknown name, a typo, a
 * stale bookmark, or a source that no longer supports the title all degrade to
 * the first entry in try-order rather than failing. A parameter that does not
 * work must never turn a playable title into an error page.
 */
export function pickStream(
 results: StreamResult[],
 preferred?: string,
): StreamResult | null {
 if (results.length === 0) return null;
 if (preferred !== undefined) {
  const chosen = results.find((result) => result.adapter.name === preferred);
  if (chosen) return chosen;
 }
 return results[0];
}
