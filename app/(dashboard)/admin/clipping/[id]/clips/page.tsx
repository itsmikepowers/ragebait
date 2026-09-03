"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { LuArrowLeft, LuLink, LuPlay } from "react-icons/lu";
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
import { ScoreBadge } from "@/components/score-badge";
import { ClipReview, RatingBadge, StatusBadge } from "@/components/clip-review";
import {
  CLIP_REVIEW_STATUS_SPECS,
  clipReviewStatus,
  type ClipReviewStatus,
} from "@/lib/clipping-meta";
import {
  CLIP_STYLE_SPECS,
  CLIP_STYLE_SPEC_FIELDS,
  clipStyleLabel,
  type ClipStyle,
} from "@/lib/clipping-meta";
import { buildCdnUrl } from "@/lib/cdn";
import { apiFetch } from "@/lib/api-client";

type MediaRef = { path: string; width: number; height: number };

type ClipSource = {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  note: string;
  tags: string[];
  releasedDate: string;
  durationSeconds: number;
  sizeBytes: number;
  video: MediaRef | null;
  thumbnail: MediaRef | null;
  thumbnailUrl: string;
  bucket: string;
  kind: "source" | "clip";
  parentId: string;
  clipStart: number;
  transcript: string;
  score: number;
  style: string;
  rating: number;
  feedback: string;
  ratedAt: string;
  reviewStatus: ClipReviewStatus;
};

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Position within the source video. Unlike a duration, 0 is meaningful here. */
function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatReleasedDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return "—";
  return format(
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12),
    "MMM d, yyyy",
  );
}

/** Human label for a bucket key; unknown keys are title-cased as-is. */
const BUCKET_LABELS: Record<string, string> = {
  hook: "Hooks",
  wisdom: "Wisdom & stories",
  highlight: "Highlights",
  reaction: "Reactions",
  banter: "Banter",
  ending: "Endings",
  other: "Other",
};

function bucketLabel(key: string): string {
  return (
    BUCKET_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ")
  );
}

/** Poster for a row: uploaded thumbnail first, else an external URL. */
function posterSrc(item: ClipSource): string | null {
  if (item.thumbnail) return buildCdnUrl(item.thumbnail.path);
  return item.thumbnailUrl || null;
}

export default function ClipsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [source, setSource] = useState<ClipSource | null>(null);
  const [clips, setClips] = useState<ClipSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewClip, setViewClip] = useState<ClipSource | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [lane, setLane] = useState<ClipReviewStatus>("review");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/clipping/${id}/clips`);
      const data = (await response.json()) as {
        source?: ClipSource;
        clips?: ClipSource[];
        error?: string;
      };
      if (!response.ok || !data.source) {
        setError(data.error || "Could not load that video.");
        return;
      }
      setSource(data.source);
      setClips(data.clips ?? []);
    } catch {
      setError("Could not load that video.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openClip(clip: ClipSource) {
    setViewClip(clip);
    setPlaying(false);
    setViewOpen(true);
  }

  const poster = source ? posterSrc(source) : null;
  const videoSrc = source?.video ? buildCdnUrl(source.video.path) : null;

  // Cutting a big batch off one source and then triaging it is the whole
  // point, so the grid is filtered by lane rather than showing everything at
  // once. Counts come off the full list so an empty lane still shows a 0.
  const laneCounts = CLIP_REVIEW_STATUS_SPECS.reduce<
    Record<ClipReviewStatus, number>
  >(
    (acc, spec) => {
      acc[spec.value] = clips.filter(
        (c) => clipReviewStatus(c.reviewStatus) === spec.value,
      ).length;
      return acc;
    },
    { review: 0, ready: 0, archived: 0 },
  );
  const visibleClips = clips.filter(
    (c) => clipReviewStatus(c.reviewStatus) === lane,
  );

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <Link
        href="/admin/clipping"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <LuArrowLeft size={15} aria-hidden />
        Clipping
      </Link>

      {loading ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,300px)_1fr]">
          <Skeleton className="h-[170px] w-full rounded-lg" />
          <div className="grid gap-2">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ) : error || !source ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {error || "Video not found."}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,300px)_1fr]">
            <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black">
              {playing && videoSrc ? (
                <video
                  className="max-h-[170px] w-full object-contain"
                  src={videoSrc}
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <button
                  type="button"
                  onClick={() => videoSrc && setPlaying(true)}
                  disabled={!videoSrc}
                  className="group relative flex w-full items-center justify-center disabled:cursor-default"
                  aria-label={videoSrc ? "Play video" : "No file uploaded"}
                >
                  {poster ? (
                    // Poster may be an external YouTube URL, so use a plain img.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={poster}
                      alt=""
                      className="max-h-[170px] w-full object-contain"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center text-sm text-white/60">
                      No preview
                    </div>
                  )}
                  {videoSrc ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-16 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm transition group-hover:bg-black/70">
                        <LuPlay className="ml-1 size-7 fill-current" />
                      </span>
                    </span>
                  ) : (
                    <span className="absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
                      Cataloged — master not uploaded
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">
                {source.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  source.creator,
                  formatReleasedDate(source.releasedDate),
                  formatDuration(source.durationSeconds),
                  formatBytes(source.sizeBytes),
                ]
                  .filter((part) => part && part !== "—")
                  .join(" · ")}
              </p>

              {source.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {source.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {source.note ? (
                <p className="mt-3 text-sm whitespace-pre-wrap">{source.note}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {source.sourceUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                      <LuLink />
                      View source
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-10">
            <h2 className="text-sm font-medium">
              Clips{" "}
              <span className="text-muted-foreground">({clips.length})</span>
            </h2>

            {clips.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CLIP_REVIEW_STATUS_SPECS.map((spec) => {
                  const active = lane === spec.value;
                  return (
                    <button
                      key={spec.value}
                      type="button"
                      onClick={() => setLane(spec.value)}
                      title={spec.meaning}
                      aria-pressed={active}
                      className={`h-8 cursor-pointer rounded-md border px-3 text-xs font-medium transition-colors ${
                        active
                          ? "border-transparent"
                          : "border-input text-muted-foreground hover:bg-black/5 hover:text-foreground"
                      }`}
                      style={
                        active
                          ? { backgroundColor: spec.bg, color: spec.fg }
                          : undefined
                      }
                    >
                      {spec.label}{" "}
                      <span className="tabular-nums opacity-70">
                        {laneCounts[spec.value]}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {clips.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No clips cut from this video yet.
              </p>
            ) : visibleClips.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {lane === "ready"
                  ? "Nothing cleared to post yet — rate a clip 5 to file it here."
                  : lane === "archived"
                    ? "Nothing archived."
                    : "Everything here has been triaged."}
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {visibleClips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => openClip(clip)}
                    className="group cursor-pointer overflow-hidden rounded-lg border border-black/10 text-left transition-colors hover:border-black/25"
                  >
                    <span className="relative block aspect-[9/16] w-full overflow-hidden bg-black">
                      {clip.thumbnail ? (
                        <Image
                          src={buildCdnUrl(clip.thumbnail.path) ?? ""}
                          alt=""
                          width={clip.thumbnail.width}
                          height={clip.thumbnail.height}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <span className="flex size-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/25">
                          <LuPlay className="ml-0.5 size-4 fill-current" />
                        </span>
                      </span>
                      <span className="absolute top-1.5 left-1.5 flex gap-1">
                        <ScoreBadge score={clip.score} />
                        <RatingBadge rating={clip.rating} />
                      </span>
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {formatDuration(clip.durationSeconds)}
                      </span>
                      <span className="absolute bottom-1.5 left-1.5">
                        <StatusBadge status={clipReviewStatus(clip.reviewStatus)} />
                      </span>
                    </span>
                    <span className="block p-2">
                      <span className="block truncate text-xs font-medium">
                        {clip.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        @{formatTimestamp(clip.clipStart)} ·{" "}
                        {formatBytes(clip.sizeBytes)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-5">
            <div className="mx-auto aspect-[9/16] h-[70vh] max-w-full overflow-hidden rounded-lg bg-black">
              {viewClip?.video ? (
                <video
                  className="h-full w-full object-cover"
                  src={buildCdnUrl(viewClip.video.path) ?? undefined}
                  controls
                  autoPlay
                  playsInline
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <DialogHeader className="pr-8">
                <DialogTitle className="flex items-center gap-2">
                  {viewClip?.score ? (
                    <ScoreBadge score={viewClip.score} size="md" />
                  ) : null}
                  {viewClip?.title ?? "Clip"}
                </DialogTitle>
                <DialogDescription>
                  {viewClip
                    ? `${bucketLabel(viewClip.bucket || "other")} · starts at ${formatTimestamp(viewClip.clipStart)} · ${formatDuration(viewClip.durationSeconds)}`
                    : null}
                </DialogDescription>
              </DialogHeader>
              {viewClip ? (
                <div className="grid max-h-[60vh] gap-3 overflow-y-auto">
                  {viewClip.note ? (
                    <p className="text-sm whitespace-pre-wrap">
                      {viewClip.note}
                    </p>
                  ) : null}
                  {viewClip.style ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Edit style
                      </span>
                      <p className="text-sm font-medium">
                        {clipStyleLabel(viewClip.style)}
                      </p>
                      {CLIP_STYLE_SPECS[viewClip.style as ClipStyle] ? (
                        <dl className="mt-1 grid gap-1 text-sm">
                          {CLIP_STYLE_SPEC_FIELDS.map(([label, key]) => (
                            <div key={key} className="grid grid-cols-[84px_1fr] gap-2">
                              <dt className="text-muted-foreground">{label}</dt>
                              <dd>
                                {CLIP_STYLE_SPECS[viewClip.style as ClipStyle][key]}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                  <ClipReview
                    clipId={viewClip.id}
                    rating={viewClip.rating}
                    feedback={viewClip.feedback}
                    reviewStatus={clipReviewStatus(viewClip.reviewStatus)}
                    onSaved={(patch) => {
                      // Keep the grid badge and the open dialog in step
                      // without refetching the whole page.
                      setClips((prev) =>
                        prev.map((c) =>
                          c.id === viewClip.id ? { ...c, ...patch } : c,
                        ),
                      );
                      setViewClip((prev) =>
                        prev && prev.id === viewClip.id
                          ? { ...prev, ...patch }
                          : prev,
                      );
                    }}
                  />
                  {viewClip.transcript ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Transcript
                      </span>
                      <p className="text-sm whitespace-pre-wrap">
                        {viewClip.transcript}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter showCloseButton>
            {viewClip?.video ? (
              <Button asChild variant="outline">
                <a
                  href={buildCdnUrl(viewClip.video.path) ?? "#"}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
