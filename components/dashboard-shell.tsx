"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LuCalendar,
  LuHouse,
  LuInbox,
  LuLayoutGrid,
  LuLightbulb,
  LuLogOut,
  LuMusic,
  LuScissors,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import { Logo } from "./logo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";

/**
 * Two navs, one shell, mirroring hypefeed.
 *
 * User mode is what EVERY signed-in account gets — Overview and Account. Admin
 * mode is the product, and lives under /admin/* so the mode is derivable from
 * the URL rather than held in state: deep links, refreshes, and the back button
 * all land in the right mode for free.
 *
 * The switcher renders only for admins, so a member never sees a control that
 * would take them somewhere the API refuses.
 */
const userLinks = [
  { href: "/overview", label: "Overview", icon: LuLayoutGrid },
  { href: "/clipping", label: "Clipping", icon: LuScissors },
  { href: "/account", label: "Account", icon: LuUser },
];

const adminLinks = [
  { href: "/admin/home", label: "Home", icon: LuHouse },
  { href: "/admin/accounts", label: "Accounts", icon: LuUsers },
  { href: "/admin/schedule", label: "Schedule", icon: LuCalendar },
  { href: "/admin/audio", label: "Audio", icon: LuMusic },
  { href: "/admin/clipping", label: "Clipping", icon: LuScissors },
  { href: "/admin/queue", label: "Queue", icon: LuInbox },
  { href: "/admin/ideas/content", label: "Ideas", icon: LuLightbulb },
  { href: "/admin/users", label: "Users", icon: LuUser },
];

/** Ideas and Clipping have sub-routes, so match on section, not exact path. */
function isActive(pathname: string, href: string): boolean {
  if (href.startsWith("/admin/ideas")) {
    return pathname.startsWith("/admin/ideas");
  }
  // Must stay exact-prefixed: "/clipping" and "/admin/clipping" are different
  // pages (user queue vs the full library), and a bare `startsWith` on the
  // former would light up both.
  if (href === "/admin/clipping") {
    return pathname.startsWith("/admin/clipping");
  }
  if (href === "/clipping") {
    return pathname === "/clipping";
  }
  return pathname === href;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { firebaseUser, user, loading, logout } = useAuth();

  const isAdmin = user?.isAdmin === true;
  const isAdminMode = pathname.startsWith("/admin") && isAdmin;
  const links = isAdminMode ? adminLinks : userLinks;
  const homeHref = isAdminMode ? "/admin/home" : "/overview";

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    // A non-admin who lands on an /admin URL (stale link, bookmark) goes back
    // to their own side rather than seeing an empty shell.
    if (user && !user.isAdmin && pathname.startsWith("/admin")) {
      router.replace("/overview");
    }
  }, [firebaseUser, user, loading, pathname, router]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !firebaseUser || !user) {
    return null;
  }

  if (!user.isAdmin && pathname.startsWith("/admin")) {
    return null;
  }

  const modeSwitcher = isAdmin ? (
    <Tabs
      value={isAdminMode ? "admin" : "user"}
      onValueChange={(value) =>
        router.push(value === "admin" ? "/admin/home" : "/overview")
      }
    >
      <TabsList className="w-full">
        <TabsTrigger value="user">User</TabsTrigger>
        <TabsTrigger value="admin">Admin</TabsTrigger>
      </TabsList>
    </Tabs>
  ) : null;

  return (
    <div className="min-h-full">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden h-dvh w-56 flex-col border-r border-black/10 bg-background px-5 py-6 md:flex">
        <Link href={homeHref}>
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

        <div className="mt-auto flex flex-col gap-3 pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LuLogOut size={16} aria-hidden />
            Log out
          </button>
          {modeSwitcher ? (
            <div className="border-t border-black/10 pt-3">{modeSwitcher}</div>
          ) : null}
        </div>
      </aside>

      {/* Mobile top header */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-black/10 bg-background px-4 md:hidden">
        <Link href={homeHref}>
          <Logo size={24} />
        </Link>
        <div className="flex items-center gap-3">
          {modeSwitcher ? (
            <div className="w-40 text-xs">{modeSwitcher}</div>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="text-muted-foreground hover:text-foreground"
          >
            <LuLogOut size={18} aria-hidden />
          </button>
        </div>
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
