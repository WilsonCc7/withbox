"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { parseProgressEvent } from "@/lib/player/progress";

type MarkAction = (formData: FormData) => void | Promise<void>;
type SaveAction = (formData: FormData) => void | Promise<void>;

/**
 * Saves at most once per SAVE_INTERVAL_MS: a player emits a progress
 * signal every few seconds, and a save per signal would hammer the
 * server with near-duplicate rows. A save is only worth the round
 * trip when the position has meaningfully moved, so a paused player
 * (same position, many signals) never saves.
 */
const SAVE_INTERVAL_MS = 30_000;
/** Below this delta the position is not "new" — just noise. */
const MIN_POSITION_DELTA_SECONDS = 5;

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
 *
 * Position reporting is separate from completion: it is throttled and never
 * blocks the completion path, and it flushes on page hide because that is the
 * common way a viewer leaves — without it a watch session stores nothing until
 * the next 30s tick.
 */
export function PlayerProgressBridge({
  allowedOrigin,
  kind,
  tmdbId,
  season = null,
  episode = null,
  markAction,
  saveAction,
  nextHref = null,
}: {
  /** Origin of the embed actually playing — the only sender we accept. */
  allowedOrigin: string;
  kind: "movie" | "tv";
  tmdbId: number;
  season?: number | null;
  episode?: number | null;
  markAction: MarkAction;
  /** Persists the playback position; called from a timer, must not throw. */
  saveAction: SaveAction;
  /** Next episode to advance to, or null to stay put. */
  nextHref?: string | null;
}) {
  const router = useRouter();

  // Latest reported position. A ref, not state: progress signals
  // arrive constantly and must never re-render the player.
  const latestRef = useRef({ position: 0, duration: null as number | null });

  useEffect(() => {
    let marked = false;

    // A fresh effect run is a fresh title: reset any position a
    // previous run left behind.
    latestRef.current = { position: 0, duration: null };

    let lastSavedAt = 0;
    let lastSavedPosition = 0;

    function buildProgressFormData(): FormData {
      const data = new FormData();
      data.set("kind", kind);
      data.set("tmdbId", String(tmdbId));
      if (season !== null) data.set("season", String(season));
      if (episode !== null) data.set("episode", String(episode));
      data.set("position", String(latestRef.current.position));
      if (latestRef.current.duration !== null) {
        data.set("duration", String(latestRef.current.duration));
      }
      return data;
    }

    function saveProgress(): void {
      // A failing save must never throw into the listener.
      void Promise.resolve(saveAction(buildProgressFormData())).catch(() => {});
    }

    /**
     * Throttled save: at most one per SAVE_INTERVAL_MS, and only
     * when the position has moved at least
     * MIN_POSITION_DELTA_SECONDS since the last save.
     *
     * The delta is absolute: seeking backwards is a real change to
     * where the viewer is, and a signed comparison would never let
     * 600 → 300 become the resume point.
     */
    function maybeSave(): void {
      const now = performance.now();
      if (
        Math.abs(latestRef.current.position - lastSavedPosition) < MIN_POSITION_DELTA_SECONDS ||
        now - lastSavedAt < SAVE_INTERVAL_MS
      ) {
        return;
      }
      lastSavedAt = now;
      lastSavedPosition = latestRef.current.position;
      saveProgress();
    }

    /** Lifecycle flush: pagehide and hidden are the common exits. */
    function flushIfMeaningful(): void {
      if (Math.abs(latestRef.current.position - lastSavedPosition) < MIN_POSITION_DELTA_SECONDS) {
        return;
      }
      lastSavedAt = performance.now();
      lastSavedPosition = latestRef.current.position;
      saveProgress();
    }

    function onMessage(event: MessageEvent) {
      if (marked) return;
      const signal = parseProgressEvent(event.origin, event.data, [allowedOrigin]);
      if (!signal) return;
      if (signal.type === "progress") {
        latestRef.current = {
          position: signal.positionSeconds,
          duration: signal.durationSeconds,
        };
        maybeSave();
        return;
      }
      marked = true;

      const data = new FormData();
      data.set("kind", kind);
      data.set("tmdbId", String(tmdbId));
      if (season !== null) data.set("season", String(season));
      if (episode !== null) data.set("episode", String(episode));

      void Promise.resolve(markAction(data))
        .then(() => {
          if (!nextHref) return;
          router.push(nextHref);
          router.refresh();
        })
        .catch(() => {});
    }

    function onPageHide(): void {
      flushIfMeaningful();
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") flushIfMeaningful();
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [allowedOrigin, kind, tmdbId, season, episode, markAction, saveAction, nextHref, router]);

  return null;
}
