import { AccountMenu } from "@/components/account-menu";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { SearchBox } from "@/components/search-box";
import { NavLink } from "@/components/tab-link";
import { currentUser } from "@/lib/session";

export async function SiteHeader({ defaultQuery = "" }: { defaultQuery?: string }) {
  const user = await currentUser();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <a className="shrink-0 font-display text-lg font-bold text-fg" href="/">
            Withbox
          </a>

          {/* Hidden below `sm`: at 390px this row was squeezed to 154px and
              clipped its own labels mid-word ("Wat"). The tab bar owns
              navigation at that width. `overflow-x-auto` stays so a narrow
              `sm` viewport scrolls the row instead of widening the page. */}
          <nav className="hidden items-center gap-4 overflow-x-auto text-sm scrollbar-none sm:flex">
            <NavLink href="/feed" label="Feed" />
            <NavLink href="/watched" label="Watched" />
            <NavLink href="/watchlist" label="Watchlist" />
            <NavLink href="/diary" label="Diary" />
            <NavLink href="/lists" label="Lists" />
            <NavLink href="/people" label="People" />
          </nav>

          {/* On mobile the collapsed box is a 40px icon-sized target that
              expands while focused; the tab bar also links to /search. */}
          <div className="ml-auto flex items-center gap-2">
            <SearchBox defaultQuery={defaultQuery} />
            {/* Purely informational: the palette owns the binding, so this is
                a <kbd>, never a focusable control. Hidden below `sm`, where
                the header has no room for it. */}
            <kbd
              aria-label="Command K opens the command palette"
              className="hidden rounded-[var(--radius-control)] border border-border px-1.5 py-0.5 text-xs text-faint sm:inline-block"
            >
              ⌘K
            </kbd>
          </div>

          {user ? (
            <AccountMenu user={{ id: user.id, name: user.name, image: user.image }} />
          ) : (
            <a
              className="shrink-0 whitespace-nowrap text-sm text-accent hover:text-accent-hi"
              href="/sign-in"
            >
              Sign in
            </a>
          )}
        </div>
      </header>

      <BottomTabBar userId={user?.id ?? null} />
    </>
  );
}
