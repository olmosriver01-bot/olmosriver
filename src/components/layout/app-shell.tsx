"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  Building2,
  Users,
  LogOut,
  ChevronsUpDown,
  Menu,
  X,
  Gauge,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { GlobalRole } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/constants";

type NavCompany = { id: string; name: string };

export function AppShell({
  user,
  companies,
  currentCompanyId,
  children,
}: {
  user: { name?: string | null; email?: string | null; role: GlobalRole };
  companies: NavCompany[];
  currentCompanyId?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const companyNav = currentCompanyId
    ? [
        { href: `/c/${currentCompanyId}/dashboard`, label: "Бошқарув панели", icon: LayoutDashboard },
        { href: `/c/${currentCompanyId}/audits`, label: "KPI аудити", icon: ClipboardList },
        { href: `/c/${currentCompanyId}/issues`, label: "Вазифалар", icon: ListChecks },
      ]
    : [];

  const adminNav =
    user.role === "ADMIN"
      ? [
          { href: `/admin/companies`, label: "Компаниялар", icon: Building2 },
          { href: `/admin/users`, label: "Фойдаланувчилар", icon: Users },
        ]
      : [];

  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Gauge className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none tracking-tight">KPI AUDIT PRO</p>
          <p className="text-[11px] text-muted-foreground">KPI тизими аудити</p>
        </div>
      </div>

      {companies.length > 0 && (
        <div className="px-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-left text-sm">
              <span className="truncate font-medium">{currentCompany?.name ?? "Компанияни танланг"}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60" align="start">
              <DropdownMenuLabel>Компаниялар</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companies.map((c) => (
                <DropdownMenuItem key={c.id} asChild>
                  <Link href={`/c/${c.id}/dashboard`}>{c.name}</Link>
                </DropdownMenuItem>
              ))}
              {user.role === "ADMIN" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin/companies">Барча компанияларни бошқариш</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {companyNav.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-surface-muted"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {adminNav.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Администратор
            </p>
            {adminNav.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-surface-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-muted">
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="h-4 w-4" /> Чиқиш
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-surface lg:block">{SidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-72 bg-surface shadow-xl">{SidebarContent}</div>
          <button
            className="flex-1 bg-black/40"
            aria-label="Ёпиш"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:px-6">
          <button className="rounded-md p-2 hover:bg-surface-muted lg:hidden" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden lg:block" />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
