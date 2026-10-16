"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";

const ROW = "block rounded px-3 py-2 text-sm text-muted hover:bg-surface-hi hover:text-fg";

/**
 * Header account menu.
 *
 * `<details>` is the no-JS path: without JS the avatar still opens the panel
 * and every row is a plain link. Because the browser owns the `open` attribute
 * once it is toggled, closing is imperative — state alone cannot dismiss a
 * panel the browser opened. `open` state exists only to feed `aria-expanded`.
 */
export function AccountMenu({
  user,
}: {
  user: { id: string; name: string; image: string | null };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (detailsRef.current) detailsRef.current.open = false;
  }, []);

  // The header survives client-side navigation, so without this a click on one
  // of the panel's own links would leave it hanging open.
  useEffect(() => {
    close();
  }, [pathname, close]);

  // `<details>` opens itself, so an outside click has to be closed explicitly.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close]);

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <details
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      ref={detailsRef}
    >
      <summary
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account"
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full [&::-webkit-details-marker]:hidden"
      >
        {user.image ? (
          <img alt="" className="h-8 w-8 rounded-full object-cover" src={user.image} />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hi text-sm font-semibold text-fg">
            {initial}
          </span>
        )}
      </summary>

      <div
        className="absolute right-0 top-full z-20 mt-2 w-52 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-lg"
        role="menu"
      >
        <a className={ROW} href={`/u/${user.id}`} onClick={close} role="menuitem">
          Profile
        </a>
        <a className={ROW} href="/diary" onClick={close} role="menuitem">
          Diary
        </a>
        <a className={ROW} href="/watchlist" onClick={close} role="menuitem">
          Watchlist
        </a>
        <a className={ROW} href="/lists" onClick={close} role="menuitem">
          Lists
        </a>
        <a className={ROW} href="/stats" onClick={close} role="menuitem">
          Stats
        </a>
        <a className={ROW} href="/settings" onClick={close} role="menuitem">
          Settings
        </a>
        <div className="my-1 h-px bg-border" role="separator" />
        <SignOutButton className="block w-full rounded px-3 py-2 text-left text-sm text-muted hover:bg-surface-hi hover:text-fg" />
      </div>
    </details>
  );
}
