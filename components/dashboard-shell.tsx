"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuCalendar,
  LuHouse,
  LuLightbulb,
  LuMusic,
  LuScissors,
  LuUsers,
} from "react-icons/lu";
import { Logo } from "./logo";

const links = [
  { href: "/home", label: "Home", icon: LuHouse },
  { href: "/accounts", label: "Accounts", icon: LuUsers },
  { href: "/schedule", label: "Schedule", icon: LuCalendar },
  { href: "/audio", label: "Audio", icon: LuMusic },
  { href: "/clipping", label: "Clipping", icon: LuScissors },
  { href: "/ideas/content", label: "Ideas", icon: LuLightbulb },
];

/** Ideas has sub-routes, so match on section rather than exact path. */
function isActive(pathname: string, href: string): boolean {
  if (href.startsWith("/ideas")) {
    return pathname.startsWith("/ideas");
  }
  return pathname === href;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-full">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden h-dvh w-56 flex-col border-r border-black/10 bg-background px-5 py-6 md:flex">
        <Link href="/home">
          <Logo />
        </Link>

        <nav className="mt-8 flex flex-col gap-1 text-sm">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 rounded-md px-2 py-2 ${
                  active
                    ? "bg-black/[0.04] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={16} aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile top header: icon + text */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center border-b border-black/10 bg-background px-4 md:hidden">
        <Link href="/home">
          <Logo size={24} />
        </Link>
      </header>

      {/* Mobile bottom nav: 3 tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-black/10 bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon size={20} aria-hidden />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <main className="min-w-0 px-4 pt-20 pb-24 md:ml-56 md:px-8 md:py-8 md:pt-8 md:pb-8">
        {children}
      </main>
    </div>
  );
}
