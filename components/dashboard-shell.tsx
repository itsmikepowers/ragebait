"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LuCalendar,
  LuHouse,
  LuLightbulb,
  LuLogOut,
  LuMusic,
  LuScissors,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import { Logo } from "./logo";
import { useAuth } from "@/lib/auth-context";

/**
 * Tabs are role-scoped.
 *
 * `adminLinks` is the real dashboard — the whole product. `userLinks` is what a
 * signed-in non-admin gets: their own account and a way out, nothing else. The
 * split is a data decision, not a styling one: a non-admin's nav never contains
 * a link to a page whose API would reject them anyway.
 */
const adminLinks = [
  { href: "/home", label: "Home", icon: LuHouse },
  { href: "/accounts", label: "Accounts", icon: LuUsers },
  { href: "/schedule", label: "Schedule", icon: LuCalendar },
  { href: "/audio", label: "Audio", icon: LuMusic },
  { href: "/clipping", label: "Clipping", icon: LuScissors },
  { href: "/ideas/content", label: "Ideas", icon: LuLightbulb },
  { href: "/users", label: "Users", icon: LuUser, adminOnly: true },
];

const userLinks = [{ href: "/account", label: "Account", icon: LuUser }];

/** Ideas has sub-routes, so match on section rather than exact path. */
function isActive(pathname: string, href: string): boolean {
  if (href.startsWith("/ideas")) {
    return pathname.startsWith("/ideas");
  }
  return pathname === href;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { firebaseUser, user, loading, logout } = useAuth();

  const isAdmin = user?.isAdmin === true;
  const links = isAdmin ? adminLinks : userLinks;

  useEffect(() => {
    if (loading) {
      return;
    }
    // Signed out — the API would reject every call anyway.
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    // Signed in but not an admin: /account is the only page they can load.
    if (user && !user.isAdmin && pathname !== "/account") {
      router.replace("/account");
    }
  }, [firebaseUser, user, loading, pathname, router]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !firebaseUser || !user) {
    return null;
  }

  if (!user.isAdmin && pathname !== "/account") {
    return null;
  }

  return (
    <div className="min-h-full">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden h-dvh w-56 flex-col border-r border-black/10 bg-background px-5 py-6 md:flex">
        <Link href={isAdmin ? "/home" : "/account"}>
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

        <button
          type="button"
          onClick={onLogout}
          className="mt-auto flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LuLogOut size={16} aria-hidden />
          Log out
        </button>
      </aside>

      {/* Mobile top header */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-black/10 bg-background px-4 md:hidden">
        <Link href={isAdmin ? "/home" : "/account"}>
          <Logo size={24} />
        </Link>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          className="text-muted-foreground hover:text-foreground"
        >
          <LuLogOut size={18} aria-hidden />
        </button>
      </header>

      {/* Mobile bottom nav */}
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
