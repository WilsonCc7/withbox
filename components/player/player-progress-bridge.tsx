"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { parseProgressEvent } from "@/lib/player/progress";

type MarkAction = (formData: FormData) => void | Promise<void>;

/**
 * Marks a title watched when the embed reports playback finished, and advances
 * to the next episode.
 *
 * Renders nothing — it exists only to own the `message` listener. Messages are
 * gated on `allowedOrigin` and parsed by `lib/player/progress`, which is tested
 * directly.
 *
 * The server action is idempotent (`markWatched`, not `toggleWatched`), and the
 * `marked` flag stops a replay or a duplicate event from firing it twice.
 */
export function PlayerProgressBridge({
  allowedOrigin,
  kind,
  tmdbId,
  season = null,
  episode = null,
  markAction,
  nextHref = null,
}: {
  /** Origin of the embed actually playing — the only sender we accept. */
  allowedOrigin: string;
  kind: "movie" | "tv";
  tmdbId: number;
  season?: number | null;
  episode?: number | null;
  markAction: MarkAction;
  /** Next episode to advance to, or null to stay put. */
  nextHref?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let marked = false;

    function onMessage(event: MessageEvent) {
      if (marked) return;
      const signal = parseProgressEvent(event.origin, event.data, [allowedOrigin]);
      if (!signal || signal.type !== "completed") return;
      marked = true;

      const data = new FormData();
      data.set("kind", kind);
      data.set("tmdbId", String(tmdbId));
      if (season !== null) data.set("season", String(season));
      if (episode !== null) data.set("episode", String(episode));

      void Promise.resolve(markAction(data)).then(() => {
        if (!nextHref) return;
        router.push(nextHref);
        router.refresh();
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowedOrigin, kind, tmdbId, season, episode, markAction, nextHref, router]);

  return null;
}
