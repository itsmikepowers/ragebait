"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";

/**
 * Root is a router, not a page. Everyone signed in lands on /overview — admins
 * switch to the product side themselves, which keeps the default the same for
 * every account and makes the switcher the one place mode changes.
 */
export default function Home() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }
    router.replace(firebaseUser ? "/overview" : "/login");
  }, [firebaseUser, loading, router]);

  return (
    <div className="flex h-[100vh] items-center justify-center px-6">
      <Logo priority />
    </div>
  );
}
