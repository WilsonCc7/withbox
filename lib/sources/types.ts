/**
 * The stream-source contract.
 *
 * Every playable stream resolves through `SourceAdapter`. Routes and
 * components depend only on these types — nothing outside `lib/sources/`
 * constructs a third-party player URL.
 *
 * `progress: true` means the embed posts playback position back and the
 * app can resume and auto-advance. `progress: false` means the user marks
 * watched manually.
 */
export type Resolution =
  | { kind: "iframe"; url: string; progress: boolean }
  | { kind: "stream"; url: string; mime: string };

export interface SourceAdapter {
  name: string;
  label: string;
  resolve(tmdbId: number, season?: number, episode?: number): Promise<Resolution | null>;
}
