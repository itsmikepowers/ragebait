"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, type AppUser } from "@/lib/auth-context";

function formatDate(iso: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** Small pill switch; disabled for owners, who can't be demoted. */
function AdminToggle({
  checked,
  disabled,
  busy,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      title={disabled ? "Owners are permanent admins." : undefined}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-foreground" : "bg-black/15"
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const { user, loading: authLoading, apiFetch } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  // Admins can read the list; only the owner may change it.
  const canToggle = user?.isSuperAdmin === true;

  useEffect(() => {
    if (!authLoading && user && !user.isAdmin) {
      router.replace("/overview");
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ users: AppUser[] }>("/api/admin/users");
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (user?.isAdmin) {
      load();
    }
  }, [user?.isAdmin, load]);

  async function toggleAdmin(target: AppUser, next: boolean) {
    setSavingId(target.id);
    setError("");
    // Optimistic: the row flips now, and reverts if the API says no.
    setUsers((prev) =>
      prev.map((row) =>
        row.id === target.id ? { ...row, isAdmin: next } : row,
      ),
    );
    try {
      await apiFetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isAdmin: next }),
      });
    } catch (err) {
      setUsers((prev) =>
        prev.map((row) =>
          row.id === target.id ? { ...row, isAdmin: !next } : row,
        ),
      );
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSavingId("");
    }
  }

  if (!user?.isAdmin) {
    return null;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>

      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="mt-8 rounded-xl border border-black/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Admin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-5 w-9 rounded-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No users yet.
                </TableCell>
              </TableRow>
            ) : (
              users.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.name || "—"}
                    {row.isSuperAdmin ? (
                      <span className="ml-2 rounded bg-black/[0.06] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        Owner
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.lastLoggedIn)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminToggle
                      checked={row.isAdmin}
                      disabled={!canToggle || row.isSuperAdmin}
                      busy={savingId === row.id}
                      onChange={(next) => toggleAdmin(row, next)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!canToggle ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Only the owner can change admin access.
        </p>
      ) : null}
    </div>
  );
}
