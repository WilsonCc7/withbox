"use client";

import { useState } from "react";
import { ActivityItemRow } from "@/components/social/activity-item";
import type { FeedRow } from "@/lib/social/feed-rows";

export function FeedList({
  initialRows,
  initialNext,
}: {
  initialRows: FeedRow[];
  initialNext: string | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialNext);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function loadMore() {
    if (!cursor || pending) return;
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/feed?before=${encodeURIComponent(cursor)}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as {
        rows: FeedRow[];
        next: string | null;
      };
      setRows((prev) => [...prev, ...data.rows]);
      setCursor(data.next);
    } catch {
      setError(true);
    } finally {
      // Clears pending on failure too; list and cursor stay untouched, and the
      // `error` flag swaps the button for a Retry.
      setPending(false);
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <ActivityItemRow
            key={row.item.id}
            // `at` arrives as an ISO string through the RSC payload and the
            // API JSON alike — rehydrate to the Date the row expects.
            item={{ ...row.item, at: new Date(row.item.at) }}
            title={row.title}
            href={row.href}
          />
        ))}
      </ul>
      {cursor && (
        <div className="mt-6 flex items-center gap-4">
          {error ? (
            <p className="text-sm text-danger">
              Couldn&apos;t load more.{" "}
              <button
                aria-busy={pending}
                className="touch-hit inline-block cursor-pointer rounded-[var(--radius-control)] px-1 text-accent transition-colors hover:text-accent-hi disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={loadMore}
                type="button"
              >
                Retry
              </button>
            </p>
          ) : (
            <button
              aria-busy={pending}
              className="cursor-pointer rounded-[var(--radius-control)] text-sm text-accent transition-colors hover:text-accent-hi active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              onClick={loadMore}
              type="button"
            >
              Load more
            </button>
          )}
          {/* No-JS path: the button needs JS, this link renders the next page server-side. */}
          <a
            className="cursor-pointer rounded-[var(--radius-control)] text-sm text-accent transition-colors hover:text-accent-hi"
            href={`/feed?before=${encodeURIComponent(cursor)}`}
          >
            Older
          </a>
        </div>
      )}
    </>
  );
}
