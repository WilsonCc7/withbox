import { FollowButton } from "@/components/social/follow-button";
import { SiteHeader } from "@/components/site-header";
import { getFollowCounts, isFollowing, listUsers } from "@/lib/social/queries";
import { currentUser } from "@/lib/session";

export default async function PeoplePage() {
  const viewer = await currentUser();

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

  const people = await listUsers(viewer.id);

  if (people.length === 0) {
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

  // One parallel fan-out: follow state and follower counts per
  // user, resolved together instead of sequential awaits per row.
  const details = await Promise.all(
    people.map((person) =>
      Promise.all([
        isFollowing(viewer.id, person.id),
        getFollowCounts(person.id),
      ]),
    ),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold">People</h1>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {people.map((person, i) => {
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
      </main>
    </>
  );
}
