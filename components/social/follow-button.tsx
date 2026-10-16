"use client";

import { useOptimistic, useTransition } from "react";
import type { FormEvent } from "react";
import { follow, unfollow } from "@/lib/social/actions";

/**
 * Follow control — works with JavaScript disabled.
 * The viewer never renders this for their own profile.
 *
 * With JavaScript the submit is intercepted: the button flips between Follow
 * and Following with no round-trip wait, and revalidation reconciles it. Both
 * branches stay real POST forms carrying the same `userId` field.
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
  const [following, setFollowing] = useOptimistic(isFollowing);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // The rendered branch decides which way the click goes; `follow` and
    // `unfollow` are not interchangeable toggles.
    const next = !following;
    startTransition(async () => {
      setFollowing(next);
      await (next ? follow(formData) : unfollow(formData));
    });
  }

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

  if (following) {
    return (
      <form
        action={unfollow}
        className="inline-block"
        method="post"
        onSubmit={onSubmit}
      >
        <input name="userId" type="hidden" value={targetId} />
        <button
          aria-busy={pending}
          aria-label={`Unfollow ${targetName}`}
          className="inline-block rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          Following
        </button>
      </form>
    );
  }

  return (
    <form
      action={follow}
      className="inline-block"
      method="post"
      onSubmit={onSubmit}
    >
      <input name="userId" type="hidden" value={targetId} />
      <button
        aria-busy={pending}
        aria-label={`Follow ${targetName}`}
        className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        Follow
      </button>
    </form>
  );
}
