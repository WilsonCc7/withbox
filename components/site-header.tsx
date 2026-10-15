import { SignOutButton } from "@/components/sign-out-button";
import { currentUser } from "@/lib/session";

export async function SiteHeader({ defaultQuery = "" }: { defaultQuery?: string }) {
  const user = await currentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <a className="text-lg font-bold text-fg" href="/">
          Withbox
        </a>

        <nav className="flex items-center gap-4 text-sm">
          <a className="text-muted hover:text-fg" href="/feed">
            Feed
          </a>
          <a className="text-muted hover:text-fg" href="/watched">
            Watched
          </a>
          <a className="text-muted hover:text-fg" href="/watchlist">
            Watchlist
          </a>
          <a className="text-muted hover:text-fg" href="/lists">
            Lists
          </a>
          <a className="text-muted hover:text-fg" href="/people">
            People
          </a>
        </nav>

        <form action="/search" className="ml-auto" method="get">
          <label className="sr-only" htmlFor="site-search">
            Search films and series
          </label>
          <input
            className="w-40 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-faint focus:border-accent sm:w-64"
            defaultValue={defaultQuery}
            id="site-search"
            name="q"
            placeholder="Search films and series"
            type="search"
          />
        </form>

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
  );
}
