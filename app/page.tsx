"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";

/**
 * Root is a router, not a page: signed-out goes to /login, admins to the
 * dashboard, everyone else to their account page.
 */
export default function Home() {
  const router = useRouter();
  const { firebaseUser, user, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    router.replace(user?.isAdmin ? "/home" : "/account");
  }, [firebaseUser, user, loading, router]);

  return (
    <div className="flex h-[100vh] items-center justify-center px-6">
      <Logo priority />
    </div>
  );
}
