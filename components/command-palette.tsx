"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Same endpoint and shape `SearchBox` uses; this is a second surface, not a second path. */
interface Suggestion {
  kind: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
}

const DEBOUNCE_MS = 250;
const TITLE_LIMIT = 6;

const NAV: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Feed", href: "/feed" },
  { label: "Watched", href: "/watched" },
  { label: "Watchlist", href: "/watchlist" },
  { label: "Diary", href: "/diary" },
  { label: "Lists", href: "/lists" },
  { label: "People", href: "/people" },
  { label: "Stats", href: "/stats" },
  { label: "Settings", href: "/settings" },
];

interface Row {
  id: string;
  label: string;
  meta: string | null;
  href: string;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * ⌘K palette: static navigation plus titles from `/api/search`. Mounted once in
 * the root layout; the dialog is not in the DOM while closed, so there are no
 * hidden focus stops on any page.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      // `/` is a shortcut only when it is not a keystroke destined for a field.
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(document.activeElement)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset per opening, and put focus back where the user left it on close.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setItems([]);
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }

    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target && document.contains(target)) target.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    abortRef.current?.abort();
    if (!q) {
      setItems([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`search ${response.status}`);
          const data = (await response.json()) as { items?: Suggestion[] };
          if (controller.signal.aborted) return;
          setItems((data.items ?? []).slice(0, TITLE_LIMIT));
        } catch {
          if (!controller.signal.aborted) setItems([]);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase();
    const nav: Row[] = NAV.filter((entry) => entry.label.toLowerCase().includes(needle)).map(
      (entry) => ({ id: `palette-nav-${entry.href}`, label: entry.label, meta: null, href: entry.href }),
    );
    const titles: Row[] = items.map((item) => ({
      id: `palette-title-${item.kind}-${item.tmdbId}`,
      label: item.title,
      meta: item.year ? String(item.year) : item.kind === "movie" ? "Film" : "Series",
      href: item.kind === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`,
    }));
    return [...nav, ...titles];
  }, [query, items]);

  // A stale index would point at a row that no longer exists after filtering.
  useEffect(() => setActiveIndex(0), [rows.length]);

  useEffect(() => {
    if (!open || rows.length === 0) return;
    document.getElementById(rows[activeIndex]?.id ?? "")?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, rows]);

  if (!open) return null;

  const active = rows[activeIndex];

  function go(row: Row | undefined) {
    if (!row) return;
    setOpen(false);
    router.push(row.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? rows.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(active);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      {/* Stops a click inside the panel from reaching the backdrop's close. */}
      <div
        aria-label="Search and navigate"
        aria-modal="true"
        className="mx-auto mt-[15vh] w-[min(560px,92vw)] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <input
          aria-activedescendant={active ? active.id : undefined}
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          aria-expanded="true"
          autoComplete="off"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-base text-fg transition-colors placeholder:text-faint focus-visible:outline-offset-[-2px]"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search titles or jump to a page"
          ref={inputRef}
          role="combobox"
          type="text"
          value={query}
        />

        <ul className="max-h-[60vh] overflow-y-auto p-1" id="palette-listbox" role="listbox">
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-faint">No results.</li>
          ) : (
            rows.map((row, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors ${
                  index === activeIndex ? "bg-surface-hi text-fg" : "text-muted hover:bg-surface-hi hover:text-fg"
                }`}
                id={row.id}
                key={row.id}
                onClick={() => go(row)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                <span className="truncate">{row.label}</span>
                {row.meta ? <span className="shrink-0 text-xs text-faint tnum">{row.meta}</span> : null}
              </li>
            ))
          )}
        </ul>

        <p className="border-t border-border px-4 py-2 text-xs text-faint">
          ↑↓ navigate · ↵ open · esc close
        </p>
      </div>
    </div>
  );
}
