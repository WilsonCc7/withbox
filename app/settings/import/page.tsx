import { SiteHeader } from "@/components/site-header";
import { importLibrary } from "@/lib/import/actions";
import { currentUser } from "@/lib/session";

const ERROR_MESSAGES: Record<string, string> = {
  file: "Choose a CSV file — an export up to 5 MB.",
  format:
    "That file is not a Letterboxd or IMDb export: its column names match neither.",
};

/** `?done=2` and friends are only trusted as digits; anything else is absent. */
function count(raw: string | undefined): number | null {
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string;
    skipped?: string;
    missing?: string;
    error?: string;
  }>;
}) {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a
              className="text-accent hover:text-accent-hi"
              href="/sign-in?next=/settings/import"
            >
              Sign in
            </a>{" "}
            to import your library.
          </h1>
        </main>
      </>
    );
  }

  const params = await searchParams;

  const parts: string[] = [];
  const done = count(params.done);
  const skipped = count(params.skipped);
  const missing = count(params.missing);
  if (done !== null) parts.push(`${done} imported`);
  if (skipped !== null) parts.push(`${skipped} skipped`);
  if (missing !== null) parts.push(`${missing} not found`);

  const error =
    params.error !== undefined ? (ERROR_MESSAGES[params.error] ?? null) : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col">
          <div className="flex items-center justify-between pt-8">
            <h1 className="text-2xl font-bold text-fg">Import your library</h1>
            <a className="text-sm text-accent hover:text-accent-hi" href="/settings">
              Settings
            </a>
          </div>

          <p className="mt-2 text-sm text-muted">
            Upload a Letterboxd or IMDb CSV export and its rows become diary
            entries — with their ratings — in one pass.
          </p>

          <form
            action={importLibrary}
            method="post"
            encType="multipart/form-data"
            className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <label className="text-sm font-semibold text-fg" htmlFor="import-file">
              CSV file
            </label>
            <input
              id="import-file"
              className="text-sm text-fg file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface-hi file:px-2 file:py-1 file:text-sm"
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
            />
            <button
              type="submit"
              className="cursor-pointer self-start rounded-md border border-border bg-surface-hi px-3 py-2 text-sm text-fg hover:border-accent"
            >
              Import
            </button>
            <p className="text-xs text-faint">
              Up to 500 rows per run; the rest of the file is reported as
              skipped.
            </p>
          </form>

          {error !== null && (
            <p className="mt-4 text-sm text-danger">{error}</p>
          )}

          {parts.length > 0 && (
            <p className="mt-4 text-sm text-muted">{parts.join(" · ")}</p>
          )}

          <details className="mt-6 text-sm text-muted">
            <summary className="cursor-pointer font-semibold text-fg">
              Which exports work, and what they become
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              <li>
                Letterboxd’s <code>watched.csv</code> — Date, Name, Year,
                Letterboxd URI — or <code>ratings.csv</code>, which is the same
                columns plus Rating.
              </li>
              <li>
                Letterboxd’s <code>watchlist.csv</code> — the same columns again,
                so the filename is what tells it from <code>watched.csv</code> —
                fills your watchlist and logs no watch.
              </li>
              <li>
                IMDb’s ratings export — Const, Title, Your Rating, Date Rated.
              </li>
              <li>
                Letterboxd’s half-stars become this app’s 1–10 score; IMDb’s
                ratings are already 1–10.
              </li>
              <li>
                A title is matched by its exact name (and year, when the file
                gives one). A row that matches nothing is counted as “not
                found” and writes nothing.
              </li>
            </ul>
            <p className="mt-2">
              Rows already in your diary for the same day are skipped, so
              running the same file again adds nothing. To bring the file up to
              date, export it again and upload the new copy.
            </p>
          </details>
        </div>
      </main>
    </>
  );
}
