import { TabLink } from "@/components/tab-link";

/**
 * Mobile primary navigation. Hidden at `sm` and up, where the header nav row
 * is visible instead. Server component: it only needs the signed-in user id
 * to build the profile href.
 */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width="24"
    >
      {children}
    </svg>
  );
}

export function BottomTabBar({ userId }: { userId: string | null }) {
  const youHref = userId ? `/u/${userId}` : "/sign-in";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-bg/95 backdrop-blur sm:hidden">
      <TabLink
        href="/"
        icon={
          <Icon>
            <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          </Icon>
        }
        label="Home"
      />
      <TabLink
        href="/search"
        icon={
          <Icon>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </Icon>
        }
        label="Search"
      />
      <TabLink
        href="/watchlist"
        icon={
          <Icon>
            <path d="M6 3h12v18l-6-4-6 4z" />
          </Icon>
        }
        label="Watchlist"
      />
      <TabLink
        href="/diary"
        icon={
          <Icon>
            <rect height="16" rx="2" width="18" x="3" y="5" />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </Icon>
        }
        label="Diary"
      />
      <TabLink
        href={youHref}
        icon={
          <Icon>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
          </Icon>
        }
        label="You"
      />
    </nav>
  );
}
