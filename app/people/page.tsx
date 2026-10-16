import { FollowButton } from "@/components/social/follow-button";
import { SiteHeader } from "@/components/site-header";
import {
  FOLLOW_LIMIT,
  getFollowCounts,
  isFollowing,
  listUsers,
} from "@/lib/social/queries";
import { currentUser } from "@/lib/session";

const PAGE_SIZE = 50;
const MAX_PAGE = 1000;

/** 1-based page from the URL: digits only, clamped; anything else is page 1. */
function parsePage(raw: string | undefined): number {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number.parseInt(raw, 10);
  return Math.min(Math.max(page, 1), MAX_PAGE);
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const viewer = await currentUser();
  const page = parsePage((await searchParams).page);

  if (!viewer) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/people">
              Sign in
            </a>{" "}
            to see who&apos;s here.
          </h1>
        </main>
      </>
    );
  }

  const { users, hasMore } = await listUsers(viewer.id, {
    offset: (page - 1) * PAGE_SIZE,
  });

  if (users.length === 0) {
    if (page > 1) {
      return (
        <>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h1 className="text-xl">No more people.</h1>
            <p className="mt-2">
              <a className="text-accent hover:text-accent-hi" href="/people">
                Back to the first page
              </a>
            </p>
          </main>
        </>
      );
    }

    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">No one else has signed up yet.</h1>
          <p className="mt-2 text-muted">
            You can still track your own watching and lists.
          </p>
        </main>
      </>
    );
  }

  const viewerCounts = await getFollowCounts(viewer.id);

  // One parallel fan-out: follow state and follower counts per
  // user, resolved together instead of sequential awaits per row.
  const details = await Promise.all(
    users.map((person) =>
      Promise.all([isFollowing(viewer.id, person.id), getFollowCounts(person.id)]),
    ),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold">People</h1>
        {viewerCounts.following >= FOLLOW_LIMIT && (
          <p className="mb-4 text-muted">
            You&apos;re at the following limit ({FOLLOW_LIMIT}).
          </p>
        )}
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {users.map((person, i) => {
            const [following, counts] = details[i];
            return (
              <li
                className="flex items-center justify-between gap-4 px-4 py-3"
                key={person.id}
              >
                <div>
                  <a
                    className="text-fg hover:text-accent"
                    href={`/u/${person.id}`}
                  >
                    {person.name}
                  </a>
                  <span className="ml-2 text-muted text-sm">
                    {counts.followers} follower
                    {counts.followers === 1 ? "" : "s"}
                  </span>
                </div>
                <FollowButton
                  targetId={person.id}
                  targetName={person.name}
                  isFollowing={following}
                  signedIn
                />
              </li>
            );
          })}
        </ul>
        <nav className="mt-6 flex items-center gap-4">
          {page > 1 && (
            <a
              className="text-accent hover:text-accent-hi text-sm"
              href={page - 1 <= 1 ? "/people" : `/people?page=${page - 1}`}
            >
              Newer
            </a>
          )}
          {hasMore && (
            <a
              className="text-accent hover:text-accent-hi text-sm"
              href={`/people?page=${page + 1}`}
            >
              Older
            </a>
          )}
        </nav>
      </main>
    </>
  );
}
