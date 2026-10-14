/**
 * Playback events posted by the stream providers' iframes.
 *
 * Two providers, two payload shapes, both naming their event `PLAYER_EVENT`:
 *
 *   vidsrc   { player_status: "completed", player_progress: 1234 }
 *            player_status is one of playing | paused | completed | seeked
 *
 *   vidlink  { event: "timeupdate", currentTime: 12.5, duration: 5400 }
 *            event is one of play | pause | seeked | ended | timeupdate
 *
 * Parsing lives here, free of DOM access, so it can be tested directly. The
 * client component is a thin wrapper around this.
 */

export type PlaybackSignal =
  | { type: "progress"; positionSeconds: number; durationSeconds: number | null }
  | { type: "completed" };

/**
 * Translate one `postMessage` payload into a signal, or `null` if it is not a
 * recognised playback event.
 *
 * `origin` is checked against `allowedOrigins` first. Messages from anywhere
 * else are dropped: an embed's origin is the only thing tying a claimed
 * "completed" to the provider actually playing.
 */
export function parseProgressEvent(
  origin: string,
  data: unknown,
  allowedOrigins: readonly string[],
): PlaybackSignal | null {
  if (!allowedOrigins.includes(origin)) return null;
  if (typeof data !== "object" || data === null) return null;

  const payload = data as Record<string, unknown>;

  // vidsrc: player_status + player_progress
  const status = payload.player_status;
  if (typeof status === "string") {
    if (status === "completed") return { type: "completed" };
    const position = asFiniteNumber(payload.player_progress);
    if (status === "seeked" || status === "playing" || status === "paused") {
      return position === null
        ? null
        : { type: "progress", positionSeconds: position, durationSeconds: null };
    }
    return null;
  }

  // vidlink: event + currentTime/duration
  const event = payload.event ?? payload.type;
  if (typeof event === "string") {
    if (event === "ended" || event === "completed") return { type: "completed" };
    if (event === "timeupdate" || event === "seeked" || event === "play" || event === "pause") {
      const position = asFiniteNumber(payload.currentTime);
      if (position === null) return null;
      return {
        type: "progress",
        positionSeconds: position,
        durationSeconds: asFiniteNumber(payload.duration),
      };
    }
  }

  return null;
}

/** Returns the number, or null for anything non-finite (including undefined). */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
