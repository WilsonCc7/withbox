"use client";

/**
 * Root error boundary for every page segment. An error boundary has to be a
 * client component, and a client component cannot import the async server
 * `SiteHeader` (it reads the session), so the header shell is mirrored here
 * without the session-aware right-hand side.
 *
 * `error` is deliberately neither rendered nor logged: the message carries no
 * value for the reader and can leak upstream detail.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <a className="shrink-0" href="/">
            <img alt="Withbox" className="h-7 w-auto" height="32" src="/logo-mark.svg" width="64" />
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold">Something went wrong.</h1>
        <p className="mt-3 text-muted">
          The catalogue could not be reached. Try again in a moment.
        </p>
        <button
          className="mt-6 inline-block cursor-pointer rounded bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-hi"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </main>
    </>
  );
}
