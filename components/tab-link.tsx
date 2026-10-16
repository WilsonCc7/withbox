"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Root only matches itself; a section matches itself and its children, so
// `/lists/3` still highlights Lists. Shared by the tab bar and the header nav
// so the two cannot drift.
export function isActivePath(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One header nav link. Client-only for the same reason as `TabLink`; the
 * header stays a server component.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = isActivePath(href, pathname);

  return (
    <a
      aria-current={active ? "page" : undefined}
      className={`shrink-0 ${active ? "text-fg" : "text-muted hover:text-fg"}`}
      href={href}
    >
      {label}
    </a>
  );
}

/**
 * One bottom-bar tab. Client-only because the active state follows the
 * pathname; the tab bar itself stays a server component so the icons are
 * plain RSC-serialized nodes.
 */
export function TabLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
}) {
  const pathname = usePathname();
  const active = isActivePath(href, pathname);

  // `text-xs` is the legible floor for functional text; measured at 390px the
  // widest label ("Watchlist") is ~55px inside a 78px tab, so it neither wraps
  // nor clips.
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 whitespace-nowrap py-2 text-xs ${
        active ? "text-accent" : "text-muted"
      }`}
      href={href}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </a>
  );
}
