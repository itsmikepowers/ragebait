"use client";

import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/lib/dashboard-data";

export default function HomePage() {
  const { home } = useDashboardData();
  const { data, loading, error, load } = home;

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>

      {error ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-black/10 p-4">
          {loading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <p className="text-sm text-muted-foreground">Accounts</p>
          )}
          <div className="mt-2">
            {loading ? (
              <Skeleton className="h-9 w-10" />
            ) : (
              <p className="text-3xl font-semibold tracking-tight">
                {data.accounts ?? "—"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
