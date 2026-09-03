"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";

/**
 * Signs the user out on load, then sends them to /login.
 *
 * A route rather than only a button so "just log me out" is a URL you can hit
 * from anywhere — a bookmark, a stuck session, another tab. The ref guards
 * against React running the effect twice in StrictMode and firing two signOuts.
 */
export default function LogoutPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    // Even if signOut throws (offline, already signed out), still land on
    // /login — being stuck on a blank "logging out" screen is worse.
    logout()
      .catch(() => undefined)
      .finally(() => router.replace("/login"));
  }, [logout, router]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6">
      <Logo />
      <p className="text-sm text-muted-foreground">Signing you out…</p>
    </div>
  );
}
