"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_STORAGE_KEY } from "@/lib/auth";

export function DashboardAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(AUTH_STORAGE_KEY) === "true") {
      setAllowed(true);
      return;
    }
    router.replace("/password");
  }, [router]);

  if (!allowed) {
    return null;
  }

  return children;
}
