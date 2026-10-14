import type { Resolution } from "@/lib/sources/types";

/**
 * Plays a resolved stream.
 *
 * The URL is never built here — it arrives already resolved through the
 * `lib/sources` seam, so this component has no knowledge of any provider.
 *
 * `progress: false` sources cannot report playback position, so the caller
 * tells the viewer to mark the title watched themselves rather than pretending
 * resume will work.
 */
export function PlayerFrame({
  resolution,
  title,
}: {
  resolution: Resolution;
  title: string;
}) {
  if (resolution.kind === "stream") {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-surface text-sm text-muted">
        Direct stream playback is not implemented yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      <iframe
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full"
        // No `sandbox`: these embeds need scripts, their own origin, and
        // fullscreen, and a restrictive sandbox silently breaks playback.
        referrerPolicy="origin"
        src={resolution.url}
        title={title}
      />
    </div>
  );
}
