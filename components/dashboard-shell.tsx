"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuCalendar, LuHouse, LuUsers } from "react-icons/lu";
import { Logo } from "./logo";

const links = [
  { href: "/home", label: "Home", icon: LuHouse },
  { href: "/accounts", label: "Accounts", icon: LuUsers },
  { href: "/schedule", label: "Schedule", icon: LuCalendar },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-full">
      <aside className="fixed inset-y-0 left-0 z-10 flex h-dvh w-56 flex-col border-r border-black/10 bg-background px-5 py-6">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="mt-8 flex flex-col gap-1 text-sm">
          {links.map((link) => {
            const active = pathname === link.href;
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
      <main className="ml-56 min-w-0 px-8 py-8">{children}</main>
    </div>
  );
}
