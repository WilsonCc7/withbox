import { SiteHeader } from "@/components/site-header";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { user } from "@/db/schema";
import { getReviewsByUser } from "@/lib/social/queries";
import { imageUrl } from "@/lib/media/images";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";

const PAGE_SIZE = 60;
const MAX_PAGE = 1000;

function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/**
 * Star glyphs for `n` half-stars: 7 → "★★★½☆". Same computation as
 * DiaryRow — the half-star split is non-obvious enough to keep named.
 */
function stars(n: number): string {
  const filled = Math.floor(n / 2);
  const half = n % 2 === 1;
  return "★".repeat(filled) + (half ? "½" : "") + "☆".repeat(5 - filled - (half ? 1 : 0));
}

// Public like the profile it extends: a visitor can read the same
// reviews the profile previews, so no sign-in gate.
export default async function UserReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;

  const [profile] = await getDb()
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  if (!profile) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            No such user.{" "}
            <a className="text-accent hover:text-accent-hi" href="/">
              Go home
            </a>
          </h1>
        </main>
      </>
    );
  }

  const page = parsePage((await searchParams).page);
  const { items, hasMore } = await getReviewsByUser(profile.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const source = mediaSource();
  const details = await Promise.all(
    items.map((item): Promise<MediaDetail | null> =>
      item.kind === "movie" ? source.movie(item.tmdbId) : source.tv(item.tmdbId),
    ),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="pb-4 pt-8">
          <a
            className="text-sm text-accent hover:text-accent-hi"
            href={`/u/${profile.id}`}
          >
            ← Back to {profile.name}
          </a>
          <h1 className="mt-1 text-xl font-semibold text-fg">
            Reviews by {profile.name}
          </h1>
        </div>

        {items.length === 0 ? (
          page > 1 ? (
            <p className="text-muted">
              No more reviews.{" "}
              <a
                className="text-accent hover:text-accent-hi"
                href={`/u/${profile.id}/reviews`}
              >
                Back to the first page
              </a>
            </p>
          ) : (
            <p className="text-muted">No reviews yet.</p>
          )
        ) : (
          <>
            <div>
              {items.map((review, i) => {
                const detail = details[i] ?? null;
                if (!detail) return null;
                const href =
                  review.kind === "movie"
                    ? `/movie/${review.tmdbId}`
                    : `/tv/${review.tmdbId}`;
                const poster = imageUrl(detail.posterPath, "w92");
                return (
                  <div
                    key={`${review.kind}-${review.tmdbId}`}
                    className="flex gap-3 border-b border-border py-3"
                  >
                    <a className="shrink-0" href={href}>
                      {poster ? (
                        <img
                          alt=""
                          className="h-[60px] w-10 rounded bg-surface-hi object-cover"
                          height={60}
                          src={poster}
                          width={40}
                        />
                      ) : (
                        <div className="h-[60px] w-10 rounded bg-surface-hi" />
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <a
                          className="text-sm font-medium text-fg hover:text-accent"
                          href={href}
                        >
                          {detail.title}
                        </a>
                        <span className="text-xs text-faint">
                          {review.updatedAt.toISOString().slice(0, 10)}
                        </span>
                      </div>
                      {review.value !== null && (
                        <p
                          aria-label={`Rated ${review.value / 2} of 5`}
                          className="mt-1 text-sm text-accent"
                        >
                          {stars(review.value)}
                        </p>
                      )}
                      {review.containsSpoilers ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted">
                            Contains spoilers
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-fg">
                            {review.body}
                          </p>
                        </details>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                          {review.body}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {(page > 1 || hasMore) && (
              <nav className="mt-6 flex items-center gap-4">
                {page > 1 && (
                  <a
                    className="text-sm text-accent hover:text-accent-hi"
                    href={
                      page - 1 <= 1
                        ? `/u/${profile.id}/reviews`
                        : `/u/${profile.id}/reviews?page=${page - 1}`
                    }
                  >
                    Newer
                  </a>
                )}
                <span className="text-sm text-muted">Page {page}</span>
                {hasMore && (
                  <a
                    className="text-sm text-accent hover:text-accent-hi"
                    href={`/u/${profile.id}/reviews?page=${page + 1}`}
                  >
                    Older
                  </a>
                )}
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
