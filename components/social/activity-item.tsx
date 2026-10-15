import type { ReactNode } from "react";
import type { ActivityItem } from "@/lib/social/types";

const REVIEW_SUMMARY_CHARS = 200;

export function ActivityItemRow({
  item,
  title,
  href,
}: {
  item: ActivityItem;
  title: string | null;
  href: string | null;
}) {
  const user = (
    <a className="text-accent hover:text-accent-hi" href={`/u/${item.user.id}`}>
      {item.user.name}
    </a>
  );
  const media = href ? (
    <a className="text-accent hover:text-accent-hi" href={href}>
      {title}
    </a>
  ) : (
    <span>{title}</span>
  );
  const stamp = (
    <span className="text-faint text-xs">
      {item.at.toISOString().slice(0, 10)}
    </span>
  );

  let body: ReactNode;
  switch (item.type) {
    case "watch": {
      const se =
        item.season !== null && item.episode !== null
          ? ` S${item.season}E${item.episode}`
          : "";
      body = (
        <>
          {user} watched {media}
          {se}
        </>
      );
      break;
    }
    case "rating":
      body = (
        <>
          {user} rated {media} {(item.value / 2).toFixed(1)}
        </>
      );
      break;
    case "review":
      body = (
        <>
          {user} reviewed {media}
          {item.containsSpoilers ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted">
                Spoiler review — show
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-muted">
                {item.body}
              </p>
            </details>
          ) : (
            <p className="mt-1 text-muted">
              {item.body.length > REVIEW_SUMMARY_CHARS
                ? `${item.body.slice(0, REVIEW_SUMMARY_CHARS)}…`
                : item.body}
            </p>
          )}
        </>
      );
      break;
    case "listed":
      body = (
        <>
          {user} created the list{" "}
          <a
            className="text-accent hover:text-accent-hi"
            href={`/lists/${item.listId}`}
          >
            {item.listName}
          </a>
        </>
      );
      break;
  }

  return (
    <li className="flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
      <span className="text-sm text-fg">{body}</span>
      {stamp}
    </li>
  );
}
