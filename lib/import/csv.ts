/**
 * RFC 4180 subset reader for the CSV exports Letterboxd and IMDb produce.
 *
 * One forward scan over the string, no regex: the only escape in the format is
 * `""` inside a quoted field, and a quoted field may hold commas, newlines and
 * CRLF. Unquoted fields are taken verbatim — trimming is the caller's call,
 * because a title that really ends in a space is unusual but silently
 * rewriting the input would hide it.
 *
 * The size caps exist because the whole file is already in memory by the time
 * this runs (the form action read it); the point is to fail loudly before a
 * 50 MB upload turns into tens of thousands of upstream lookups.
 */

/** Rows beyond this are rejected rather than imported. */
export const CSV_MAX_ROWS = 5000;
/**
 * Measured in UTF-16 code units, not encoded bytes: encoding the whole file
 * just to check its size costs a second copy of it, and the two only diverge
 * for non-ASCII input, where the character count is the smaller number.
 */
export const CSV_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Parse CSV text into rows of raw fields.
 *
 * A trailing newline does not produce an empty row; an empty input is `[]`.
 * Throws a plain `Error` when the input is over {@link CSV_MAX_BYTES} or
 * {@link CSV_MAX_ROWS}.
 */
export function parseCsv(text: string): string[][] {
  if (text.length > CSV_MAX_BYTES) {
    throw new Error("csv file is larger than 5 MB");
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // `""` inside a quoted field is one literal quote.
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      // CRLF is one terminator, not two.
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (rows.length > CSV_MAX_ROWS) {
        throw new Error("csv file has more than 5000 rows");
      }
      continue;
    }
    field += char;
  }

  // A file ending without a terminator still has a last row; a file ending
  // with one has nothing left to flush. An unterminated quote keeps its field
  // rather than dropping the row — the caller sees the data as written.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
    if (rows.length > CSV_MAX_ROWS) {
      throw new Error("csv file has more than 5000 rows");
    }
  }

  return rows;
}
