import { follow, unfollow } from "@/lib/social/actions";

/**
 * Plain-form follow control — works with JavaScript disabled.
 * The viewer never renders this for their own profile.
 */
export function FollowButton({
  targetId,
  targetName,
  isFollowing,
  signedIn,
}: {
  targetId: string;
  targetName: string;
  isFollowing: boolean;
  signedIn: boolean;
}) {
  if (!signedIn) {
    return (
      <a
        className="text-accent hover:text-accent-hi"
        href={`/sign-in?next=/u/${targetId}`}
      >
        Sign in to follow
      </a>
    );
  }

  if (isFollowing) {
    return (
      <form action={unfollow} method="post" className="inline-block">
        <input name="userId" type="hidden" value={targetId} />
        <button
          aria-label={`Unfollow ${targetName}`}
          className="inline-block rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          type="submit"
        >
          Following
        </button>
      </form>
    );
  }

  return (
    <form action={follow} method="post" className="inline-block">
      <input name="userId" type="hidden" value={targetId} />
      <button
        aria-label={`Follow ${targetName}`}
        className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg"
        type="submit"
      >
        Follow
      </button>
    </form>
  );
}
