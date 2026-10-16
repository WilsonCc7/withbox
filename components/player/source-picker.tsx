"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * The "Source:" row on the watch page.
 *
 * `href` values are built by the caller (the page owns which stream resolves
 * for a given name) — nothing here constructs a provider URL.
 *
 * Picking a source remembers it, so returning to a title does not silently
 * fall back to the first adapter; an explicit `?source=` always wins.
 */
const STORAGE_KEY = "withbox:source";

export function SourcePicker({
  options,
  resolvedName,
  initialSource,
  children,
}: {
  // `name` is the identity (localStorage, ?source=, comparison with
  // resolvedName); `label` is what gets displayed.
  options: { name: string; label: string; href: string; progress: boolean }[];
  resolvedName: string;
  initialSource: string | null;
  // React nodes cross the server/client boundary; functions cannot.
  // The watch page renders its resume note in this same row.
  children?: ReactNode;
}) {
  const router = useRouter();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    // An explicit ?source= is the viewer's current choice; only fall back to
    // the remembered one when the URL says nothing.
    if (initialSource !== null) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (stored) {
      const storedOption = options.find((option) => option.name === stored);
      if (storedOption) router.replace(storedOption.href);
    }
  }, [initialSource, options, router]);

  // Private mode or a full store: the link still works, it just will not be
  // remembered.
  function remember(name: string) {
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      /* navigation already in flight; nothing to do */
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
      <span>Source:</span>
      {options.map((option) =>
        // Highlight the adapter that is ACTUALLY playing, not the one
        // requested — otherwise a fallback would show a source as selected
        // while a different one plays.
        option.name === resolvedName ? (
          <span className="font-medium text-fg" key={option.name}>
            ✓ {option.label}
          </span>
        ) : (
          <a
            className="text-muted hover:text-accent"
            href={option.href}
            key={option.name}
            onClick={() => remember(option.name)}
          >
            {option.label}
            {option.progress && <span title="reports playback position">~</span>}
          </a>
        ),
      )}
      {children}
    </div>
  );
}
