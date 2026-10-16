/**
 * KV response cache for upstream JSON.
 *
 * Optional: scripts and tests pass no `kv` and the fetcher runs directly.
 * A `null` value (a 404 / missing id) is never written, so a missing title
 * costs exactly one call and keeps missing-id behavior honest.
 */

export function cacheKey(path: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return query ? `tmdb:${path}?${query}` : `tmdb:${path}`;
}

export async function cachedJson<T>(
  kv: KVNamespace | undefined,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (kv) {
    const hit = await kv.get(key, "json");
    if (hit !== null && hit !== undefined) return hit as T;
  }

  const value = await fetcher();

  // Never memoize "absent": a 404 must stay a live lookup.
  if (kv && value !== null && value !== undefined) {
    try {
      await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
    } catch {
      // A cache write failing must not fail the request.
    }
  }

  return value;
}
