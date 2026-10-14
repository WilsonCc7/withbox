/**
 * Self-check for the provider postMessage parsing.
 *
 * Run: node --experimental-strip-types lib/player/progress.test.ts
 *
 * Plain asserts, no framework — this is the one non-obvious piece of logic in
 * the progress bridge (two providers, two payload shapes, same event name).
 */
import assert from "node:assert/strict";
import { parseProgressEvent, type PlaybackSignal } from "./progress.ts";

const VIDSRC = "https://vidsrc.mov";
const VIDLINK = "https://vidlink.pro";
const ALLOWED = [VIDSRC, VIDLINK];

let checks = 0;

function expect(
  label: string,
  origin: string,
  data: unknown,
  want: PlaybackSignal | null,
): void {
  const got = parseProgressEvent(origin, data, ALLOWED);
  assert.deepEqual(got, want, `${label}: got ${JSON.stringify(got)}`);
  checks += 1;
}

// --- origin gate ---------------------------------------------------------
expect("wrong origin is dropped", "https://evil.example", { player_status: "completed" }, null);
expect("empty origin is dropped", "", { event: "ended" }, null);
expect(
  "lookalike origin is dropped",
  "https://vidlink.pro.evil.example",
  { event: "ended" },
  null,
);

// --- vidsrc: player_status / player_progress -----------------------------
expect("vidsrc completed", VIDSRC, { player_status: "completed" }, { type: "completed" });
expect(
  "vidsrc playing reports position",
  VIDSRC,
  { player_status: "playing", player_progress: 1234 },
  { type: "progress", positionSeconds: 1234, durationSeconds: null },
);
expect("vidsrc unknown status", VIDSRC, { player_status: "buffering" }, null);
expect("vidsrc playing without progress", VIDSRC, { player_status: "playing" }, null);

// --- vidlink: event / currentTime / duration -----------------------------
expect("vidlink ended", VIDLINK, { event: "ended" }, { type: "completed" });
expect(
  "vidlink timeupdate carries duration",
  VIDLINK,
  { event: "timeupdate", currentTime: 12.5, duration: 5400 },
  { type: "progress", positionSeconds: 12.5, durationSeconds: 5400 },
);
expect("vidlink play without time", VIDLINK, { event: "play" }, null);
expect("vidlink unknown event", VIDLINK, { event: "buffering" }, null);

// --- malformed input -----------------------------------------------------
expect("null payload", VIDLINK, null, null);
expect("string payload", VIDLINK, "ended", null);
expect("array payload", VIDLINK, [], null);
expect("empty object", VIDLINK, {}, null);
expect("NaN position", VIDLINK, { event: "timeupdate", currentTime: Number.NaN }, null);
expect(
  "Infinity position",
  VIDLINK,
  { event: "timeupdate", currentTime: Number.POSITIVE_INFINITY },
  null,
);
expect("string position", VIDLINK, { event: "timeupdate", currentTime: "12" }, null);
expect(
  "missing duration is allowed",
  VIDLINK,
  { event: "timeupdate", currentTime: 3 },
  { type: "progress", positionSeconds: 3, durationSeconds: null },
);

// A payload naming both shapes favours player_status (vidsrc's field), which is
// the more specific signal.
expect(
  "both shapes present",
  VIDSRC,
  { player_status: "completed", event: "timeupdate", currentTime: 1 },
  { type: "completed" },
);

// The empty-allowlist case above needs its own call to prove the gate, not the
// parse: rerun one valid payload through parseProgressEvent directly.
assert.equal(
  parseProgressEvent(VIDLINK, { event: "ended" }, []),
  null,
  "empty allowlist must reject",
);
checks += 1;

console.log(`ok  ${checks} progress-parsing checks passed`);
