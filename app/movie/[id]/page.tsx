import { MediaLibraryPanel } from "@/components/media-library-panel";
import { SiteHeader } from "@/components/site-header";
import { AddToListPicker } from "@/components/social/list-toolbar";
import { getWatchState, isInWatchlist } from "@/lib/library/queries";
import { imageUrl } from "@/lib/media/images";
import { getListsByUser } from "@/lib/social/queries";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";


function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">Not a valid film id.</h1>
        </main>
      </>
    );
  }

  const movie = await mediaSource().movie(tmdbId);

  if (!movie) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">No film with id {tmdbId}.</h1>
        </main>
      </>
    );
  }

  const backdrop = imageUrl(movie.backdropPath, "w1280");
  const poster = imageUrl(movie.posterPath, "w342");
  const runtime = formatRuntime(movie.runtime);
  const facts = [movie.year, runtime, movie.genres.map((g) => g.name).join(", ")]
    .filter(Boolean)
    .join(" · ");

  const user = await currentUser();
  const ref = { kind: "movie" as const, tmdbId };
  const [watchState, inWatchlist] = user
    ? await Promise.all([getWatchState(user.id, ref), isInWatchlist(user.id, ref)])
    : [null, false];
  const lists = user ? await getListsByUser(user.id) : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="relative mb-6 h-48 overflow-hidden rounded-lg bg-surface sm:h-64">
          {backdrop && (
            <img
              alt=""
              className="h-full w-full object-cover opacity-60"
              height={720}
              src={backdrop}
              width={1280}
            />
          )}
        </div>

        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="w-32 shrink-0 sm:w-48">
            {poster ? (
              <img
                alt={movie.title}
                className="w-full rounded-lg border border-border"
                height={513}
                src={poster}
                width={342}
              />
            ) : (
              <div className="aspect-2/3 w-full rounded-lg border border-border bg-surface-hi" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-accent">Film</p>
            <h1 className="mt-1 text-3xl font-semibold leading-tight">
              {movie.title}
              {movie.year && <span className="ml-2 font-normal text-muted">{movie.year}</span>}
            </h1>

            {facts && <p className="mt-2 text-sm text-muted">{facts}</p>}

            <p className="mt-3">
              <a
                className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-bg"
                href={`/watch/movie/${tmdbId}`}
              >
                ▶ Play
              </a>
            </p>

            {movie.voteAverage !== null && (
              <p className="mt-2 text-sm text-muted">
                <span className="text-accent">★ {movie.voteAverage.toFixed(1)}</span>
                {movie.voteCount !== null && (
                  <span className="text-faint"> ({movie.voteCount.toLocaleString()} votes)</span>
                )}
              </p>
            )}

            {movie.tagline && <p className="mt-4 text-sm italic text-faint">{movie.tagline}</p>}

            {movie.overview && (
              <p className="mt-4 max-w-2xl leading-7 text-muted">{movie.overview}</p>
            )}
          </div>
        </div>

        {user && watchState ? (
          <MediaLibraryPanel
            inWatchlist={inWatchlist}
            kind="movie"
            state={watchState}
            tmdbId={tmdbId}
          />
        ) : (
          <p className="mt-8 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            <a className="text-accent hover:text-accent-hi" href="/sign-in">
              Sign in
            </a>{" "}
            to track this film.
          </p>
        )}
        {user && lists.length === 0 && (
          <p className="mt-4 text-xs text-muted">
            <a className="text-accent hover:text-accent-hi" href="/lists">
              Create a list
            </a>{" "}
            to group this with others.
          </p>
        )}
        {user && lists.length > 0 && (
          <div className="mt-4">
            <AddToListPicker kind="movie" lists={lists} tmdbId={tmdbId} />
          </div>
        )}
      </main>
    </>
  );
}
