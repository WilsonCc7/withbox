import { DiaryRow } from "@/components/diary-row";
import { SiteHeader } from "@/components/site-header";
import { deleteWatchEntry } from "@/lib/library/actions";
import { getDiary, getDiaryYears, getWatchStates } from "@/lib/library/queries";
import { mediaKey } from "@/lib/library/types";
import type { MediaDetail } from "@/lib/media/types";
import { mediaSource } from "@/lib/media/runtime";
import { currentUser } from "@/lib/session";

const PAGE_SIZE = 60;
const MAX_PAGE = 1000;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/** Digits only and in range; anything else means "no filter". */
function parseYear(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
}

function parseMonth(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; year?: string; month?: string }>;
}) {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-xl">
            <a className="text-accent hover:text-accent-hi" href="/sign-in?next=/diary">
              Sign in
            </a>{" "}
            to see your diary.
          </h1>
        </main>
      </>
    );
  }

  const query = await searchParams;
  const page = parsePage(query.page);
  const year = parseYear(query.year);
  const month = parseMonth(query.month);

  // Filters always reset to page 1; pagination carries them forward.
  function href(y: number | null, m: number | null, p = 1): string {
    const params = new URLSearchParams();
    if (y !== null) params.set("year", String(y));
    if (m !== null) params.set("month", String(m));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/diary?${qs}` : "/diary";
  }

  const chip = (active: boolean): string =>
    `rounded-md border px-2.5 py-1 text-sm ${
      active ? "border-accent text-fg" : "border-border text-muted hover:text-fg"
    }`;

  const [years, diaryPage] = await Promise.all([
    getDiaryYears(user.id),
    getDiary(user.id, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      year,
      month,
    }),
  ]);

  const source = mediaSource();
  const details = await Promise.all(
    diaryPage.items.map((entry): Promise<MediaDetail | null> =>
      entry.kind === "movie" ? source.movie(entry.tmdbId) : source.tv(entry.tmdbId),
    ),
  );
  const states = await getWatchStates(
    user.id,
    diaryPage.items.map((entry) => ({ kind: entry.kind, tmdbId: entry.tmdbId })),
  );

  const filterLabel = [
    month !== null ? (MONTH_NAMES[month - 1] ?? null) : null,
    year !== null ? String(year) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="pb-4 pt-8">
          <h1 className="text-xl font-semibold text-fg">Diary</h1>
          <p className="mt-1 text-xs text-faint">
            Scores and reviews belong to the title, not the individual entry.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            aria-current={year === null && month === null ? "page" : undefined}
            className={chip(year === null && month === null)}
            href={href(null, null)}
          >
            All years
          </a>
          {years.map((y) => (
            <a
              key={y}
              aria-current={y === year ? "page" : undefined}
              className={chip(y === year)}
              href={href(y, month)}
            >
              {y}
            </a>
          ))}
        </div>

        {year !== null && (
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              aria-current={month === null ? "page" : undefined}
              className={chip(month === null)}
              href={href(year, null)}
            >
              All months
            </a>
            {MONTH_NAMES.map((name, i) => (
              <a
                key={name}
                aria-current={month === i + 1 ? "page" : undefined}
                className={chip(month === i + 1)}
                href={href(year, i + 1)}
              >
                {name}
              </a>
            ))}
          </div>
        )}

        <div className="mt-4">
          {diaryPage.items.length === 0 ? (
            page > 1 ? (
              <p className="text-muted">
                No more entries.{" "}
                <a className="text-accent hover:text-accent-hi" href={href(year, month)}>
                  Back to the first page
                </a>
              </p>
            ) : year === null && month === null ? (
              <p className="text-muted">
                Nothing logged yet. Log a watch from any title page and it will
                show up here.
              </p>
            ) : (
              <p className="text-muted">Nothing logged in {filterLabel}.</p>
            )
          ) : (
            <>
              <div>
                {diaryPage.items.map((entry, i) => {
                  const detail = details[i] ?? null;
                  if (!detail) return null;
                  const state = states.get(mediaKey(entry));
                  const href =
                    entry.kind === "movie" ? `/movie/${entry.tmdbId}` : `/tv/${entry.tmdbId}`;
                  return (
                    <DiaryRow
                      key={entry.id}
                      href={href}
                      title={detail.title}
                      posterPath={detail.posterPath}
                      season={entry.season}
                      episode={entry.episode}
                      watchedAt={entry.watchedAt.toISOString().slice(0, 10)}
                      rewatch={entry.rewatch}
                      rating={state?.rating ?? null}
                      excerpt={state?.review?.body ?? null}
                      canDelete={true}
                      deleteAction={deleteWatchEntry}
                      entryId={entry.id}
                    />
                  );
                })}
              </div>
              {(page > 1 || diaryPage.hasMore) && (
                <nav className="mt-6 flex items-center gap-4">
                  {page > 1 && (
                    <a
                      className="text-sm text-accent hover:text-accent-hi"
                      href={href(year, month, page - 1)}
                    >
                      Newer
                    </a>
                  )}
                  <span className="text-sm text-muted">Page {page}</span>
                  {diaryPage.hasMore && (
                    <a
                      className="text-sm text-accent hover:text-accent-hi"
                      href={href(year, month, page + 1)}
                    >
                      Older
                    </a>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
