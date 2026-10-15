/**
 * The stream-source contract.
 *
 * Every playable stream resolves through `SourceAdapter`. Routes and
 * components depend only on these types — nothing outside `lib/sources/`
 * constructs a third-party player URL.
 *
 * Two different capabilities, deliberately kept separate:
 * - `Resolution.progress` — the embed REPORTS playback position back,
 *   which is what makes resume possible at all.
 * - `SourceAdapter.resumes` — the embed ACCEPTS a start position.
 *   Only adapters with `resumes: true` honour `startAtSeconds`.
 */
export type Resolution =
  | { kind: "iframe"; url: string; progress: boolean }
  | { kind: "stream"; url: string; mime: string };

export interface SourceAdapter {
  name: string;
  label: string;
  /** Whether this adapter honours `startAtSeconds`. */
  resumes: boolean;
  /**
   * `startAtSeconds` is a resume hint an adapter may ignore — see
   * `resumes`. It is only passed for slots the player actually holds a
   * position for.
   */
  resolve(
    tmdbId: number,
    season?: number,
    episode?: number,
    startAtSeconds?: number,
  ): Promise<Resolution | null>;
}
