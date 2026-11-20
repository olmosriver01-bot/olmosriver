"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function InboxNav({ companyId, manager, admin, pendingFindings }: { companyId: string; manager: boolean; admin: boolean; pendingFindings?: number }) {
  const pathname = usePathname() ?? "";
  const base = `/c/${companyId}/inbox`;
  const items = [
    { href: base, label: "Суҳбатлар", active: pathname === base || /\/inbox\/(?!findings|reports|settings)[^/]+$/.test(pathname) },
    ...(manager
      ? [
          { href: `${base}/findings`, label: `Топилмалар${pendingFindings ? ` (${pendingFindings})` : ""}`, active: pathname.startsWith(`${base}/findings`) },
          { href: `${base}/reports`, label: "Ҳисобот", active: pathname.startsWith(`${base}/reports`) },
        ]
      : []),
    ...(admin ? [{ href: `${base}/settings`, label: "Созламалар", active: pathname.startsWith(`${base}/settings`) }] : []),
  ];
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:px-0">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
            i.active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
