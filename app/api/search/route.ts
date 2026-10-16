import { mediaSource } from "@/lib/media/runtime";
import { TmdbHttpError } from "@/lib/tmdb/live";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
/** Above this many tracked IPs, stale windows are swept out. */
const SWEEP_ABOVE = 1_000;

/** Per-isolate token bucket. Best-effort: enough to stop a runaway client. */
const hits = new Map<string, number[]>();

function allowed(ip: string, now: number): boolean {
  if (hits.size > SWEEP_ABOVE) {
    for (const [key, times] of hits) {
      const fresh = times.filter((time) => now - time < WINDOW_MS);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }

  const recent = (hits.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

const JSON_HEADERS = { "cache-control": "public, max-age=120" };

export async function GET(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!allowed(ip, Date.now())) {
    return Response.json(
      { error: "rate limited" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (!q) {
    return Response.json(
      { items: [], page: 1, totalPages: 0, totalResults: 0 },
      { headers: JSON_HEADERS },
    );
  }

  try {
    const page = await mediaSource().search(q, "multi", 1);
    return Response.json(
      {
        items: page.items.slice(0, 8).map((item) => ({
          kind: item.kind,
          tmdbId: item.tmdbId,
          title: item.title,
          year: item.year,
          posterPath: item.posterPath,
        })),
        page: 1,
        totalPages: page.totalPages,
        totalResults: page.totalResults,
      },
      { headers: JSON_HEADERS },
    );
  } catch (error) {
    if (error instanceof TmdbHttpError) {
      return Response.json({ error: "search unavailable" }, { status: 502 });
    }
    throw error;
  }
}
