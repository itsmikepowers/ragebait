"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaThumb } from "@/components/media-thumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildCdnUrl } from "@/lib/cdn";
import { useAuth } from "@/lib/auth-context";
import {
  REQUEST_STATUS_LABELS,
  type ClipRequest,
  type RequestStatus,
} from "@/lib/clip-requests-meta";

type Clip = {
  id: string;
  title: string;
  video: { path: string; width: number; height: number } | null;
  thumbnail: { path: string; width: number; height: number } | null;
  transcript: string;
  score: number;
};

const STATUS_STYLES: Record<RequestStatus, string> = {
  queued: "bg-black/[0.06] text-muted-foreground",
  processing: "bg-amber-100 text-amber-900",
  done: "bg-emerald-100 text-emerald-900",
  failed: "bg-red-100 text-red-900",
};

function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[status]}`}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

function relative(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ClippingPage() {
  const { apiFetch } = useAuth();
  const [requests, setRequests] = useState<ClipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ClipRequest | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ requests: ClipRequest[] }>("/api/requests");
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your videos.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is in flight so "Working on it" turns into "Done"
  // without the user refreshing. Stops entirely once the queue is settled.
  useEffect(() => {
    const active = requests.some(
      (r) => r.status === "queued" || r.status === "processing",
    );
    if (!active) {
      return;
    }
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [requests, load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!url.trim()) {
      setError("Paste a YouTube link.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiFetch<{ request: ClipRequest }>("/api/requests", {
        method: "POST",
        body: JSON.stringify({ youtubeUrl: url }),
      });
      setUrl("");
      setRequests((prev) => {
        const without = prev.filter((r) => r.id !== data.request.id);
        return [data.request, ...without];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit that.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setError("");
    const prev = requests;
    setRequests((rows) => rows.filter((r) => r.id !== id));
    try {
      await apiFetch(`/api/requests/${id}`, { method: "DELETE" });
    } catch (err) {
      setRequests(prev);
      setError(err instanceof Error ? err.message : "Could not remove that.");
    }
  }

  async function openRequest(request: ClipRequest) {
    setOpen(request);
    setClips([]);
    if (request.status !== "done") {
      return;
    }
    setClipsLoading(true);
    try {
      const data = await apiFetch<{ clips: Clip[] }>(`/api/requests/${request.id}`);
      setClips(data.clips ?? []);
    } catch {
      setClips([]);
    } finally {
      setClipsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold tracking-tight">Clipping</h1>

      <form onSubmit={onSubmit} className="mt-8 flex max-w-xl gap-2">
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube link"
          className="h-10 rounded-lg"
        />
        <Button type="submit" disabled={busy} className="h-10 shrink-0 px-5">
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex flex-col gap-2">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No videos yet. Paste a YouTube link above and we&apos;ll cut it into
            clips.
          </p>
        ) : (
          requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center gap-3 rounded-xl border border-black/10 p-3"
            >
              <button
                type="button"
                onClick={() => openRequest(request)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {request.title || request.youtubeUrl}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {relative(request.createdAt)}
                    {request.status === "done" && request.clipCount > 0
                      ? ` · ${request.clipCount} clip${request.clipCount === 1 ? "" : "s"}`
                      : ""}
                    {request.status === "failed" && request.error
                      ? ` · ${request.error}`
                      : ""}
                  </p>
                </div>
                <StatusPill status={request.status} />
              </button>

              {request.status === "queued" ? (
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => onDelete(request.id)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <LuTrash2 size={16} />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {open?.title || open?.youtubeUrl || "Video"}
            </DialogTitle>
          </DialogHeader>

          {open?.status !== "done" ? (
            <p className="text-sm text-muted-foreground">
              {open?.status === "failed"
                ? open?.error || "That one didn't work out."
                : open?.status === "processing"
                  ? "We're cutting this one up now."
                  : "Waiting in the queue."}
            </p>
          ) : clipsLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[9/16] w-full rounded-lg" />
              ))}
            </div>
          ) : clips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clips on this one.</p>
          ) : (
            <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {clips.map((clip) => {
                const src = buildCdnUrl(clip.video?.path);
                return (
                  <a
                    key={clip.id}
                    href={src ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col gap-1.5"
                  >
                    <div className="overflow-hidden rounded-lg border border-black/10">
                      <MediaThumb
                        media={clip.thumbnail}
                        fallbackLabel={clip.title}
                        size={220}
                        className="aspect-[9/16] !h-auto w-full object-cover"
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground group-hover:text-foreground">
                      {clip.title}
                    </p>
                  </a>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
