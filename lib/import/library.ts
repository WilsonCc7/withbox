/**
 * Map a Letterboxd or IMDb export into the intents the importer writes.
 *
 * Plain functions over `string[][]` — no `lib/media`, no DB, no fetch — so the
 * whole mapping is testable by handing it a parsed sheet. Column positions are
 * looked up by header NAME, not index: both sites have reordered and added
 * columns over the years, and a positional reader silently imports the wrong
 * cell when they do.
 *
 * Rating scales differ per site and are normalised to this project's 1–10:
 * Letterboxd stars are 0.5–5 (doubled), IMDb is already 1–10.
 */

export type ExportKind = "letterboxd-watched" | "letterboxd-ratings" | "imdb-ratings";

export interface WatchIntent {
  title: string;
  year: number | null;
  imdbId: string | null;
  watchedAt: Date | null;
  rating: number | null;
}

/** Letterboxd's two exports share this header; the ratings one adds `Rating`. */
const LETTERBOXD_COLUMNS = ["date", "name", "year", "letterboxd uri"];
const IMDB_COLUMNS = ["const", "title", "your rating", "date rated"];

/**
 * Which export a header line is, or `null` when it is neither.
 *
 * Matched on names only, case-insensitively and tolerant of surrounding
 * spaces, so an extra column (Letterboxd's `Rating`, IMDb's `Original Title`)
 * does not defeat detection.
 */
export function detectExport(header: string[]): ExportKind | null {
  const names = header.map((name) => name.trim().toLowerCase());
  const hasAll = (expected: string[]) => expected.every((name) => names.includes(name));

  // Ratings first: its header is the watched header plus one column.
  if (hasAll(LETTERBOXD_COLUMNS)) {
    return names.includes("rating") ? "letterboxd-ratings" : "letterboxd-watched";
  }
  if (hasAll(IMDB_COLUMNS)) return "imdb-ratings";
  return null;
}

/**
 * One intent per data row, header row included in `rows` (and skipped).
 *
 * A row without a title is dropped rather than imported as an empty search —
 * these files end with a stray blank line often enough that counting it as a
 * failure would report a phantom error on every clean import.
 */
export function toWatchIntent(rows: string[][], kind: ExportKind): WatchIntent[] {
  if (rows.length < 2) return [];

  const columns = columnIndexes(rows[0]);
  const intents: WatchIntent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const intent =
      kind === "imdb-ratings"
        ? readImdbRow(rows[i], columns)
        : readLetterboxdRow(rows[i], columns);
    if (intent !== null) intents.push(intent);
  }
  return intents;
}

function readLetterboxdRow(
  row: string[],
  columns: Map<string, number>,
): WatchIntent | null {
  const title = cell(row, columns, "name");
  if (title === "") return null;

  const yearCell = cell(row, columns, "year");
  return {
    title,
    year: yearCell === "" ? parseTitleYear(title) : parseYear(yearCell),
    // A `Letterboxd URI` is a boxd.it link, never a tt id.
    imdbId: null,
    watchedAt: parseWatchedAt(cell(row, columns, "date")),
    rating: parseLetterboxdRating(cell(row, columns, "rating")),
  };
}

function readImdbRow(
  row: string[],
  columns: Map<string, number>,
): WatchIntent | null {
  const title = cell(row, columns, "title");
  if (title === "") return null;

  const yearCell = cell(row, columns, "year");
  const originalTitle = cell(row, columns, "original title");
  // `Const` (`tt0137523`) is the only id column trusted here; a Letterboxd
  // `URI` is a boxd.it link and is never read as a tt id.
  const imdbIdCell = cell(row, columns, "const");
  return {
    title,
    year:
      yearCell !== ""
        ? parseYear(yearCell)
        : (parseTitleYear(title) ?? parseTitleYear(originalTitle)),
    imdbId: /^tt\d+$/.test(imdbIdCell) ? imdbIdCell : null,
    watchedAt: parseWatchedAt(cell(row, columns, "date rated")),
    rating: parseImdbRating(cell(row, columns, "your rating")),
  };
}

/** First occurrence wins: a duplicate header name is the site's bug, not ours. */
function columnIndexes(header: string[]): Map<string, number> {
  const columns = new Map<string, number>();
  header.forEach((name, index) => {
    const key = name.trim().toLowerCase();
    if (!columns.has(key)) columns.set(key, index);
  });
  return columns;
}

/** A cell by column name; `""` for a missing column or a short row. */
function cell(row: readonly string[], columns: Map<string, number>, name: string): string {
  const index = columns.get(name);
  if (index === undefined) return "";
  const value = (row as readonly (string | undefined)[])[index];
  return value === undefined ? "" : value.trim();
}

/**
 * `YYYY-MM-DD` at noon UTC, mirroring the check inline in `logWatch`
 * (`lib/library/actions.ts`): the round trip rejects rollovers
 * (`2026-02-31` becomes March 2nd) and 1900–2100 keeps a typo from planting a
 * year-504 diary entry. Mirrored, not imported — `logWatch` keeps it inline
 * inside a form action with no exported helper, and this module must not
 * depend on that file. If it is ever extracted, delete this copy.
 */
function parseWatchedAt(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const date = new Date(`${raw}T12:00:00Z`);
  const year = date.getUTCFullYear();
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== raw ||
    year < 1900 ||
    year > 2100
  ) {
    return null;
  }
  return date;
}

/** A 4-digit year out of a `Year` cell, validated against the diary range. */
function parseYear(raw: string): number | null {
  const match = /\b(\d{4})\b/.exec(raw);
  if (match === null) return null;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? year : null;
}

/**
 * A year out of a title: IMDb writes `Fight Club (1999)`, but a title can open
 * with a year of its own (`1917 (2019)`), so the parenthesised form wins.
 */
function parseTitleYear(raw: string): number | null {
  const parenthesised = /\((\d{4})\)/.exec(raw);
  return parseYear(parenthesised === null ? raw : parenthesised[1]);
}

/** Letterboxd's 0.5–5 stars, doubled to this project's 1–10. */
function parseLetterboxdRating(raw: string): number | null {
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0.5 || value > 5) return null;
  return Math.round(value * 2);
}

/** IMDb's `Your Rating` is already 1–10. */
function parseImdbRating(raw: string): number | null {
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}
