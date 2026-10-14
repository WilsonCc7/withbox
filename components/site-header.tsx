export function SiteHeader({ defaultQuery = "" }: { defaultQuery?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <a className="text-lg font-bold text-fg" href="/">
          Withbox
        </a>
        <form action="/search" method="get" className="ml-auto">
          <label className="sr-only" htmlFor="site-search">
            Search films and series
          </label>
          <input
            className="w-48 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-faint focus:border-accent sm:w-64"
            defaultValue={defaultQuery}
            id="site-search"
            name="q"
            placeholder="Search films and series"
            type="search"
          />
        </form>
      </div>
    </header>
  );
}
