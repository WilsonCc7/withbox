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

  async function loadMore() {
    if (!cursor || pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/feed?before=${encodeURIComponent(cursor)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        rows: FeedRow[];
        next: string | null;
      };
      setRows((prev) => [...prev, ...data.rows]);
      setCursor(data.next);
    } finally {
      // Restores the button on failure too; list and cursor stay untouched.
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
          <button
            type="button"
            onClick={loadMore}
            disabled={pending}
            className={`text-sm text-accent hover:text-accent-hi${pending ? " opacity-60" : ""}`}
          >
            Load more
          </button>
          {/* No-JS path: the button needs JS, this link renders the next page server-side. */}
          <a
            className="text-sm text-accent hover:text-accent-hi"
            href={`/feed?before=${encodeURIComponent(cursor)}`}
          >
            Older
          </a>
        </div>
      )}
    </>
  );
}
