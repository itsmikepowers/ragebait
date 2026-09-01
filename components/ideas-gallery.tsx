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

export type Idea = {
  id: string;
  kind: "content" | "account";
  title: string;
  sourceUsername: string;
  sourceUrl: string;
  mediaUrl: string;
  thumbnailUrl: string;
  isVideo: boolean;
  category: string;
  risk: "safe" | "edgy" | "avoid";
  note: string;
  captionIdea: string;
  likes: number;
  comments: number;
  followers: number;
  postCount: number;
  used: boolean;
};

export function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

const CATEGORY_LABELS: Record<string, string> = {
  "band-logo-parody": "Band logo parody",
  "name-acrostic": "Name acrostic",
  relationship: "Relationship",
  "pick-one": "Pick one",
  "wholesome-illustrated": "Wholesome / illustrated",
  "corporate-parody": "Corporate parody",
  "absurd-oneliner": "Absurd one-liner",
  other: "Other",
};

const RISK_STYLES: Record<string, string> = {
  safe: "bg-emerald-100 text-emerald-800",
  edgy: "bg-amber-100 text-amber-900",
  avoid: "bg-red-100 text-red-800",
};

export function IdeasGallery({
  kind,
  title,
  description,
  emptyLabel,
}: {
  kind: "content" | "account";
  title: string;
  description: string;
  emptyLabel: string;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewIdea, setViewIdea] = useState<Idea | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/ideas?kind=${kind}`);
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
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchIdea(idea: Idea, body: Record<string, unknown>) {
    setSavingId(idea.id);
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const categories = Array.from(
    new Set(ideas.map((idea) => idea.category).filter(Boolean)),
  ).sort();
  const visible =
    categoryFilter === "all"
      ? ideas
      : ideas.filter((idea) => idea.category === categoryFilter);

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {kind === "content" && categories.length > 1 ? (
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter by format"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            >
              <option value="all">All formats</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category] ?? category}
                </option>
              ))}
            </select>
          ) : null}
          <Button type="button" variant="outline" onClick={() => load()}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="grid gap-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((idea) => (
            <button
              key={idea.id}
              type="button"
              onClick={() => {
                setViewIdea(idea);
                setPlaying(false);
                setViewOpen(true);
              }}
              className="group grid cursor-pointer gap-2 text-left"
            >
              <span className="relative block aspect-square overflow-hidden rounded-lg bg-black/5">
                {idea.thumbnailUrl ? (
                  // Scraped thumbnails come from many hosts; a plain img avoids
                  // next/image remote-host allowlisting per source.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={idea.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className={`h-full w-full transition group-hover:opacity-90 ${
                      idea.kind === "account"
                        ? "object-contain p-6"
                        : "object-cover"
                    }`}
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
                {idea.title || idea.sourceUsername || "Untitled"}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {idea.kind === "account" ? (
                  <>
                    <span>@{idea.sourceUsername}</span>
                    <span>·</span>
                    <span>{formatCount(idea.followers)} followers</span>
                  </>
                ) : (
                  <>
                    <span>@{idea.sourceUsername}</span>
                    <span>·</span>
                    <span>{formatCount(idea.likes)} likes</span>
                  </>
                )}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    RISK_STYLES[idea.risk] ?? RISK_STYLES.safe
                  }`}
                >
                  {idea.risk}
                </span>
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
                  {viewIdea?.title || viewIdea?.sourceUsername || "Idea"}
                </DialogTitle>
                <DialogDescription>
                  {viewIdea
                    ? viewIdea.kind === "account"
                      ? `@${viewIdea.sourceUsername} · ${formatCount(viewIdea.followers)} followers · ${formatCount(viewIdea.postCount)} posts`
                      : `@${viewIdea.sourceUsername} · ${formatCount(viewIdea.likes)} likes · ${formatCount(viewIdea.comments)} comments`
                    : null}
                </DialogDescription>
              </DialogHeader>

              {viewIdea ? (
                <div className="grid max-h-[50vh] gap-3 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                      {CATEGORY_LABELS[viewIdea.category] ?? viewIdea.category}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        RISK_STYLES[viewIdea.risk] ?? RISK_STYLES.safe
                      }`}
                    >
                      {viewIdea.risk}
                    </span>
                  </div>
                  {viewIdea.note ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {viewIdea.kind === "account"
                          ? "Why mine this account"
                          : "Why it works"}
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
                  {viewIdea.kind === "account" ? "Profile" : "Source"}
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
                onClick={() => patchIdea(viewIdea, { used: !viewIdea.used })}
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
