"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LuTrash2 } from "react-icons/lu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import {
  REQUEST_STATUS_LABELS,
  type ClipRequest,
  type RequestStatus,
} from "@/lib/clip-requests-meta";

const STATUS_STYLES: Record<RequestStatus, string> = {
  queued: "bg-black/[0.06] text-muted-foreground",
  processing: "bg-amber-100 text-amber-900",
  done: "bg-emerald-100 text-emerald-900",
  failed: "bg-red-100 text-red-900",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/**
 * The whole queue, every user. Admin-only — the API refuses `?all=1` for
 * anyone else, so this page can't be made to leak by fiddling with the URL.
 *
 * This is the operator's worklist: it's where you see what came in, copy the
 * job id into clipkit, and watch it move.
 */
export default function QueuePage() {
  const { apiFetch } = useAuth();
  const [rows, setRows] = useState<ClipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<{ requests: ClipRequest[] }>(
        "/api/requests?all=1",
      );
      setRows(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the queue.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the operator view fresh while jobs are moving.
  useEffect(() => {
    const active = rows.some(
      (r) => r.status === "queued" || r.status === "processing",
    );
    if (!active) return;
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [rows, load]);

  async function onDelete(id: string) {
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      await apiFetch(`/api/requests/${id}`, { method: "DELETE" });
    } catch (err) {
      setRows(prev);
      setError(err instanceof Error ? err.message : "Could not remove that.");
    }
  }

  const queued = rows.filter((r) => r.status === "queued").length;
  const working = rows.filter((r) => r.status === "processing").length;

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {queued} queued · {working} in progress
      </p>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 rounded-xl border border-black/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Video</TableHead>
              <TableHead>Submitted by</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Clips</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Nothing submitted yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[280px]">
                    <a
                      href={row.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-medium hover:underline"
                    >
                      {row.title || row.youtubeUrl}
                    </a>
                    {row.error ? (
                      <span className="mt-0.5 block truncate text-xs text-destructive">
                        {row.error}
                      </span>
                    ) : null}
                    {/* The job id is what you paste into clipkit, so it stays
                        available on every row — including failed ones, which
                        are exactly the rows you need to retry. */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(row.id);
                        setCopied(row.id);
                        setTimeout(() => setCopied(""), 1200);
                      }}
                      className="mt-0.5 block font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {copied === row.id ? "copied" : row.id}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.userEmail}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status]}`}
                    >
                      {REQUEST_STATUS_LABELS[row.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "done" && row.sourceId ? (
                      <Link
                        href={`/admin/clipping/${row.sourceId}/clips`}
                        className="hover:underline"
                      >
                        {row.clipCount}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => onDelete(row.id)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <LuTrash2 size={15} />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
