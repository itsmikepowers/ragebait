"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const [accounts, setAccounts] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/home")
      .then(async (response) => {
        const data = (await response.json()) as {
          accounts?: number;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load home.");
        }
        setAccounts(data.accounts ?? 0);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load home.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>

      {error ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="rounded-xl border border-black/10 p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-3 h-8 w-10" />
          </div>
        ) : (
          <div className="rounded-xl border border-black/10 p-4">
            <p className="text-sm text-muted-foreground">Accounts</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {accounts ?? "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
