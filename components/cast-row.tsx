import { imageUrl } from "@/lib/media/images";
import type { CastMember, CreatedBy, CrewMember } from "@/lib/media/types";

/**
 * Cast list plus the film's director or the series' creators.
 *
 * A horizontally scrollable strip on phones (a 6-column grid would shrink
 * portraits below the point of recognition) and a grid from `sm` up. Renders
 * nothing when the transport could not supply credits — a fixture-mode build
 * shows no empty section.
 */
export function CastRow({
  cast,
  crew,
  createdBy,
}: {
  cast: CastMember[];
  crew: CrewMember[];
  createdBy?: CreatedBy[];
}) {
  const directors = crew.filter((member) => member.job === "Director");
  const creators = createdBy ?? [];
  if (cast.length === 0 && directors.length === 0 && creators.length === 0) {
    return null;
  }

  const byline = creators.length > 0 ? creators : directors;
  const bylineLabel = creators.length > 0 ? "Created by" : "Directed by";

  return (
    <section className="mt-8">
      {byline.length > 0 && (
        <p className="text-sm text-muted">
          {bylineLabel} <span className="text-fg">{byline.map((p) => p.name).join(", ")}</span>
        </p>
      )}

      {cast.length > 0 && (
        <div className="scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible lg:grid-cols-6">
          {cast.map((member, index) => {
            const photo = imageUrl(member.profilePath, "w185");
            const initials = member.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join("");
            return (
              <div className="w-24 shrink-0 snap-start sm:w-auto" key={`${member.tmdbId}-${index}`}>
                <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-surface-hi">
                  {photo ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      src={photo}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm text-faint">
                      {initials}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-fg">{member.name}</p>
                {member.character && (
                  <p className="truncate text-xs text-faint">as {member.character}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
