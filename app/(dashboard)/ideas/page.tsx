"use client";

import { useCallback, useEffect, useState } from "react";
import { LuCheck, LuInstagram, LuPlay, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type Idea = {
  id: string;
  sourceUsername: string;
  sourceUrl: string;
  mediaUrl: string;
  thumbnailUrl: string;
  isVideo: boolean;
  shirtText: string;
  note: string;
  captionIdea: string;
  likes: number;
  comments: number;
  used: boolean;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewIdea, setViewIdea] = useState<Idea | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [savingId, setSavingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ideas");
      const data = (await response.json()) as {
        ideas?: Idea[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not load ideas.");
      }
      setIdeas(data.ideas ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load ideas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleUsed(idea: Idea) {
    setSavingId(idea.id);
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ used: !idea.used }),
      });
      const data = (await response.json()) as { idea?: Idea; error?: string };
      if (!response.ok || !data.idea) {
        setError(data.error || "Could not update that idea.");
        return;
      }
      const updated = data.idea;
      setIdeas((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setViewIdea((current) =>
        current && current.id === updated.id ? updated : current,
      );
    } catch {
      setError("Could not update that idea.");
    } finally {
      setSavingId("");
    }
  }

  async function removeIdea(idea: Idea) {
    setSavingId(idea.id);
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error || "Could not remove that idea.");
        return;
      }
      setIdeas((current) => current.filter((item) => item.id !== idea.id));
      setViewOpen(false);
    } catch {
      setError("Could not remove that idea.");
    } finally {
      setSavingId("");
    }
  }

  function openIdea(idea: Idea) {
    setViewIdea(idea);
    setPlaying(false);
    setViewOpen(true);
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved reference posts to pull content ideas from.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="grid gap-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No ideas saved yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map((idea) => (
            <button
              key={idea.id}
              type="button"
              onClick={() => openIdea(idea)}
              className="group grid cursor-pointer gap-2 text-left"
            >
              <span className="relative block aspect-square overflow-hidden rounded-lg bg-black/5">
                {idea.thumbnailUrl ? (
                  // Remote CDN hosts vary per idea; plain img avoids next/image
                  // host allowlisting for arbitrary scraped sources.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={idea.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:opacity-90"
                  />
                ) : null}
                {idea.isVideo ? (
                  <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                    <LuPlay className="ml-0.5 size-3.5 fill-current" />
                  </span>
                ) : null}
                {idea.used ? (
                  <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-medium text-white">
                    <LuCheck className="size-3" /> Used
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-2 text-sm font-medium">
                {idea.shirtText || "Untitled idea"}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>@{idea.sourceUsername}</span>
                <span>·</span>
                <span>{formatCount(idea.likes)} likes</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={viewOpen}
        onOpenChange={(next) => {
          setViewOpen(next);
          if (!next) {
            setPlaying(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black">
              {viewIdea ? (
                playing && viewIdea.isVideo && viewIdea.mediaUrl ? (
                  <video
                    className="max-h-[65vh] w-full object-contain"
                    src={viewIdea.mediaUrl}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (viewIdea.isVideo) {
                        setPlaying(true);
                      }
                    }}
                    className="group relative flex w-full items-center justify-center"
                    aria-label={viewIdea.isVideo ? "Play video" : "Preview"}
                  >
                    {viewIdea.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewIdea.thumbnailUrl}
                        alt=""
                        className="max-h-[65vh] w-full object-contain"
                      />
                    ) : (
                      <span className="flex aspect-square w-full items-center justify-center text-sm text-white/60">
                        No preview
                      </span>
                    )}
                    {viewIdea.isVideo ? (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 transition group-hover:bg-black/70">
                          <LuPlay className="ml-0.5 size-6 fill-current" />
                        </span>
                      </span>
                    ) : null}
                  </button>
                )
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <DialogHeader className="pr-8">
                <DialogTitle>
                  {viewIdea?.shirtText || "Idea"}
                </DialogTitle>
                <DialogDescription>
                  {viewIdea
                    ? `@${viewIdea.sourceUsername} · ${formatCount(viewIdea.likes)} likes · ${formatCount(viewIdea.comments)} comments`
                    : null}
                </DialogDescription>
              </DialogHeader>

              {viewIdea ? (
                <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
                  {viewIdea.note ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Why it works
                      </span>
                      <p className="text-sm whitespace-pre-wrap">
                        {viewIdea.note}
                      </p>
                    </div>
                  ) : null}
                  {viewIdea.captionIdea ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Caption idea
                      </span>
                      <p className="text-sm whitespace-pre-wrap">
                        {viewIdea.captionIdea}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter showCloseButton>
            {viewIdea?.sourceUrl ? (
              <Button asChild variant="outline">
                <a href={viewIdea.sourceUrl} target="_blank" rel="noreferrer">
                  <LuInstagram />
                  Source
                </a>
              </Button>
            ) : null}
            {viewIdea ? (
              <Button
                type="button"
                variant="outline"
                disabled={savingId === viewIdea.id}
                onClick={() => removeIdea(viewIdea)}
              >
                <LuTrash2 />
                Remove
              </Button>
            ) : null}
            {viewIdea ? (
              <Button
                type="button"
                disabled={savingId === viewIdea.id}
                onClick={() => toggleUsed(viewIdea)}
              >
                {viewIdea.used ? "Mark unused" : "Mark used"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
