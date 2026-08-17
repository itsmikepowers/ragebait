"use client";

import { useEffect, useState } from "react";

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
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>

      {error ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-black/10 p-4">
          <p className="text-sm text-muted-foreground">Accounts</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {loading ? "—" : accounts ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
