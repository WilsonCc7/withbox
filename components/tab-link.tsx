"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  // Root only matches itself; a section matches itself and its children, so
  // `/lists/3` still highlights Lists.
  const active =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <a
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
        active ? "text-accent" : "text-muted"
      }`}
      href={href}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </a>
  );
}
