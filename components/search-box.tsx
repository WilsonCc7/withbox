"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { imageUrl } from "@/lib/media/images";

interface Suggestion {
 kind: "movie" | "tv";
 tmdbId: number;
 title: string;
 year: number | null;
 posterPath: string | null;
}

const DEBOUNCE_MS = 250;

function detailHref(item: Suggestion): string {
 return item.kind === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
}

/**
 * Header search. The form is the no-JS path: submitting GETs `/search?q=`,
 * which renders the full results page. With JS the same input also drives a
 * debounced suggestion dropdown backed by `/api/search`.
 */
export function SearchBox({ defaultQuery = "" }: { defaultQuery?: string }) {
 const router = useRouter();
 const [query, setQuery] = useState(defaultQuery);
 const [items, setItems] = useState<Suggestion[]>([]);
 const [open, setOpen] = useState(false);
 const [activeIndex, setActiveIndex] = useState(-1);
 const wrapperRef = useRef<HTMLDivElement>(null);
 const abortRef = useRef<AbortController | null>(null);

 useEffect(() => {
  const q = query.trim();
  // A query change invalidates whatever was on screen; only this effect's
  // own response is allowed to repopulate it.
  abortRef.current?.abort();
  if (!q) {
   setItems([]);
   setOpen(false);
   setActiveIndex(-1);
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
     const next = data.items ?? [];
     setItems(next);
     setActiveIndex(-1);
     setOpen(next.length > 0);
    } catch {
     // Aborted or failed: leave nothing stale behind.
     if (controller.signal.aborted) return;
     setItems([]);
     setOpen(false);
     setActiveIndex(-1);
    }
   })();
  }, DEBOUNCE_MS);

  return () => {
   clearTimeout(timer);
   controller.abort();
  };
 }, [query]);

 useEffect(() => {
  function onPointerDown(event: PointerEvent) {
   if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
    setOpen(false);
   }
  }
  document.addEventListener("pointerdown", onPointerDown);
  return () => document.removeEventListener("pointerdown", onPointerDown);
 }, []);

 function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Escape") {
   setOpen(false);
   setActiveIndex(-1);
   return;
  }
  // Without an open dropdown the form's native submit owns Enter.
  if (!open || items.length === 0) return;

  if (event.key === "ArrowDown") {
   event.preventDefault();
   setActiveIndex((index) => (index + 1) % items.length);
  } else if (event.key === "ArrowUp") {
   event.preventDefault();
   setActiveIndex((index) => (index <= 0 ? items.length - 1 : index - 1));
  } else if (event.key === "Enter" && activeIndex >= 0) {
   event.preventDefault();
   router.push(detailHref(items[activeIndex]));
   setOpen(false);
  }
 }

 // Collapsed on mobile because a static 160px box overflows a 320px header;
 // it expands on focus with no transition, since animating `width` is layout
 // thrash. Only the input's colours ease (see `transition-colors` below).
 return (
  <div className="relative w-10 focus-within:w-40 sm:w-64" ref={wrapperRef}>
   {/* Collapsed to 40px the input shows no text, so without this the box
          reads as an empty rectangle on mobile. */}
   <svg
    aria-hidden="true"
    className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
   >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
   </svg>
   <form action="/search" method="get">
    <label className="sr-only" htmlFor="site-search">
     Search films and series
    </label>
    <input
     aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
     aria-controls="search-listbox"
     aria-expanded={open}
     autoComplete="off"
     className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm text-fg transition-colors placeholder:text-faint focus:border-accent"
     id="site-search"
     name="q"
     onBlur={(event) => {
      if (!wrapperRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
     }}
     onChange={(event) => setQuery(event.target.value)}
     onKeyDown={onKeyDown}
     placeholder="Search films and series"
     role="combobox"
     type="search"
     value={query}
    />
   </form>

   {open ? (
    <ul
     className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
     id="search-listbox"
     role="listbox"
    >
     {items.map((item, index) => {
      const poster = imageUrl(item.posterPath, "w92");
      return (
       <li
        aria-selected={index === activeIndex}
        className={`border-b border-border last:border-b-0 ${index === activeIndex ? "bg-surface-hi" : ""
         }`}
        id={`search-option-${index}`}
        key={`${item.kind}:${item.tmdbId}`}
        role="option"
       >
        <a className="flex items-center gap-3 px-3 py-2" href={detailHref(item)}>
         {poster ? (
          <img
           alt=""
           className="h-14 w-10 shrink-0 rounded object-cover"
           height={56}
           loading="lazy"
           src={poster}
           width={40}
          />
         ) : (
          <span className="h-14 w-10 shrink-0 rounded bg-surface-hi" />
         )}
         <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{item.title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
           <span>{item.year ?? "—"}</span>
           <span className="whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-xs uppercase tracking-wide">
            {item.kind === "movie" ? "Film" : "Series"}
           </span>
          </span>
         </span>
        </a>
       </li>
      );
     })}
    </ul>
   ) : null}
  </div>
 );
}
