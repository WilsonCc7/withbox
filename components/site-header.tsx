import { BottomTabBar } from "@/components/bottom-tab-bar";
import { SearchBox } from "@/components/search-box";
import { SignOutButton } from "@/components/sign-out-button";
import { currentUser } from "@/lib/session";

export async function SiteHeader({ defaultQuery = "" }: { defaultQuery?: string }) {
  const user = await currentUser();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <a className="text-lg font-bold text-fg" href="/">
            Withbox
          </a>

          <nav className="flex items-center gap-4 overflow-x-auto text-sm scrollbar-none sm:overflow-visible">
            <a className="shrink-0 text-muted hover:text-fg" href="/feed">
              Feed
            </a>
            <a className="shrink-0 text-muted hover:text-fg" href="/watched">
              Watched
            </a>
            <a className="shrink-0 text-muted hover:text-fg" href="/watchlist">
              Watchlist
            </a>
            <a className="shrink-0 text-muted hover:text-fg" href="/diary">
              Diary
            </a>
            <a className="shrink-0 text-muted hover:text-fg" href="/lists">
              Lists
            </a>
            <a className="shrink-0 text-muted hover:text-fg" href="/people">
              People
            </a>
          </nav>

          {/* On mobile the collapsed box is a 40px icon-sized target that
              expands while focused; the tab bar also links to /search. */}
          <div className="ml-auto">
            <SearchBox defaultQuery={defaultQuery} />
          </div>

          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">{user.name}</span>
              <SignOutButton />
            </div>
          ) : (
            <a className="text-sm text-accent hover:text-accent-hi" href="/sign-in">
              Sign in
            </a>
          )}
        </div>
      </header>

      <BottomTabBar userId={user?.id ?? null} />
    </>
  );
}
