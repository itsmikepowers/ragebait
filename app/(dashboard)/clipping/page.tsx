"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { LuFileVideo, LuLink, LuPlay, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaThumb } from "@/components/media-thumb";
import { buildCdnUrl } from "@/lib/cdn";
import { cn } from "@/lib/utils";

type MediaRef = {
  path: string;
  width: number;
  height: number;
};

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
  video: MediaRef;
  thumbnail: MediaRef | null;
  clipped: boolean;
  kind: "source" | "clip";
  parentId: string;
  clipStart: number;
  transcript: string;
};

type ClipDraft = {
  title: string;
  creator: string;
  sourceUrl: string;
  note: string;
  tags: string;
  releasedDate?: Date;
  file: File | null;
};

const emptyDraft: ClipDraft = {
  title: "",
  creator: "",
  sourceUrl: "",
  note: "",
  tags: "",
  releasedDate: undefined,
  file: null,
};

const VIDEO_MAX_BYTES = 16 * 1024 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

/** Browsers report "" for some containers (e.g. .mkv); fall back to the ext. */
function resolveContentType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = VIDEO_CONTENT_TYPES[ext];
  if (byExt) {
    return byExt;
  }
  return file.type && file.type.startsWith("video/") ? file.type : "";
}

function formatBytes(bytes: number): string {
  if (!bytes) {
    return "—";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 0 means unknown — callers render an em dash rather than a fake "0:00". */
function formatDuration(seconds: number): string {
  if (!seconds) {
    return "—";
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" (stored as UTC midnight) -> a local Date at noon, so the
 * calendar highlights the intended day regardless of timezone offset.
 */
function isoDateToLocalDate(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) {
    return undefined;
  }
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
    0,
  );
}

function localDateToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReleasedDate(iso: string): string {
  const local = isoDateToLocalDate(iso);
  return local ? format(local, "MMM d, yyyy") : "—";
}

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.status === 413
        ? "That video is too large."
        : "Could not add that video.",
    );
  }
}

function putBlob(
  url: string,
  blob: Blob,
  onProgress?: (loaded: number) => void,
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag") ?? "" });
        return;
      }
      reject(new Error("Could not upload that video."));
    };
    xhr.onerror = () => reject(new Error("Could not upload that video."));
    xhr.ontimeout = () => reject(new Error("Could not upload that video."));
    // Multi-GB masters can take a long while on a slow connection.
    xhr.timeout = 6 * 60 * 60 * 1000;
    xhr.send(blob);
  });
}

async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}

function readVideoMeta(
  file: File,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that video."));
    };
    video.src = url;
  });
}

/** Draws the first frame onto a canvas and returns it as a JPEG blob. */
function captureFirstFrame(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    function cleanup() {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    }

    video.onloadeddata = () => {
      try {
        // Seek slightly in; frame 0 is often black on long-form video.
        video.currentTime = Math.min(1, video.duration || 1);
      } catch {
        // ignore
      }
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Could not read that video."));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) {
            reject(new Error("Could not read that video."));
            return;
          }
          resolve({ blob, width: canvas.width, height: canvas.height });
        },
        "image/jpeg",
        0.85,
      );
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read that video."));
    };

    video.src = url;
  });
}

async function uploadThumbnail(
  blob: Blob,
  width: number,
  height: number,
): Promise<MediaRef> {
  const planResponse = await fetch("/api/clipping/thumbnail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: blob.size, contentType: "image/jpeg" }),
  });
  const plan = await readApiJson<{
    path?: string;
    uploadUrl?: string;
    error?: string;
  }>(planResponse);
  if (!planResponse.ok || !plan.path || !plan.uploadUrl) {
    throw new Error(plan.error || "Could not upload that thumbnail.");
  }
  await putBlob(plan.uploadUrl, blob);
  return { path: plan.path, width, height };
}

type UploadPlan = {
  path?: string;
  strategy?: "put" | "multipart";
  uploadUrl?: string;
  uploadId?: string;
  partSize?: number;
  parts?: { partNumber: number; uploadUrl: string }[];
  error?: string;
};

async function uploadVideoToR2(
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<{ video: MediaRef; thumbnail: MediaRef | null; duration: number }> {
  const metaPromise = readVideoMeta(file);
  const thumbnailPromise = captureFirstFrame(file)
    .then(({ blob, width, height }) => uploadThumbnail(blob, width, height))
    .catch(() => null);

  const planResponse = await fetch("/api/clipping/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size, contentType }),
  });
  const plan = await readApiJson<UploadPlan>(planResponse);
  if (!planResponse.ok || !plan.path) {
    throw new Error(plan.error || "Could not upload that video.");
  }

  if (plan.strategy === "multipart") {
    if (!plan.uploadId || !plan.partSize || !plan.parts?.length) {
      throw new Error("Could not upload that video.");
    }
    const loadedByPart = new Array(plan.parts.length).fill(0);
    try {
      const completed = await runPool(
        plan.parts,
        UPLOAD_CONCURRENCY,
        async (part, index) => {
          const start = (part.partNumber - 1) * plan.partSize!;
          const blob = file.slice(
            start,
            Math.min(start + plan.partSize!, file.size),
          );
          const { etag } = await putBlob(part.uploadUrl, blob, (loaded) => {
            loadedByPart[index] = loaded;
            const total = loadedByPart.reduce((sum, value) => sum + value, 0);
            onProgress(Math.min(100, Math.round((total / file.size) * 100)));
          });
          if (!etag) {
            throw new Error("Could not upload that video.");
          }
          return { partNumber: part.partNumber, etag };
        },
      );
      const completeResponse = await fetch("/api/clipping/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: plan.path,
          uploadId: plan.uploadId,
          parts: completed,
        }),
      });
      const completeData = await readApiJson<{ path?: string; error?: string }>(
        completeResponse,
      );
      if (!completeResponse.ok || !completeData.path) {
        throw new Error(completeData.error || "Could not upload that video.");
      }
      onProgress(100);
      const meta = await metaPromise;
      const thumbnail = await thumbnailPromise;
      return {
        video: {
          path: completeData.path,
          width: meta.width,
          height: meta.height,
        },
        thumbnail,
        duration: meta.duration,
      };
    } catch (error) {
      await fetch("/api/clipping/upload/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: plan.path, uploadId: plan.uploadId }),
      }).catch(() => undefined);
      throw error;
    }
  }

  if (!plan.uploadUrl) {
    throw new Error("Could not upload that video.");
  }
  await putBlob(plan.uploadUrl, file, (loaded) => {
    onProgress(Math.min(100, Math.round((loaded / file.size) * 100)));
  });
  onProgress(100);
  const meta = await metaPromise;
  const thumbnail = await thumbnailPromise;
  return {
    video: { path: plan.path, width: meta.width, height: meta.height },
    thumbnail,
    duration: meta.duration,
  };
}

function VideoDrop({
  id,
  file,
  onFile,
}: {
  id: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function setDrag(event: DragEvent<HTMLLabelElement>, next: boolean) {
    event.preventDefault();
    setDragging(next);
  }

  return (
    <label
      htmlFor={id}
      onDragEnter={(event) => setDrag(event, true)}
      onDragOver={(event) => setDrag(event, true)}
      onDragLeave={(event) => setDrag(event, false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFile(event.dataTransfer.files[0] ?? null);
      }}
      className={cn(
        "flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-input px-3 py-5 text-center transition-colors",
        dragging ? "border-foreground/40 bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <input
        id={id}
        key={file ? "chosen" : "empty"}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <LuFileVideo size={20} aria-hidden />
          <p className="mt-2 max-w-full truncate text-sm font-medium">
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBytes(file.size)}
          </p>
        </>
      ) : (
        <>
          <LuUpload size={20} className="text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm">
            Drop a video here, or click to pick one
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            MP4, MOV, WEBM, or MKV — long-form masters welcome
          </p>
        </>
      )}
    </label>
  );
}

function ClipFields({
  idPrefix,
  title,
  creator,
  sourceUrl,
  releasedDate,
  tags,
  note,
  onTitleChange,
  onCreatorChange,
  onSourceUrlChange,
  onReleasedDateChange,
  onTagsChange,
  onNoteChange,
}: {
  idPrefix: string;
  title: string;
  creator: string;
  sourceUrl: string;
  releasedDate?: Date;
  tags: string;
  note: string;
  onTitleChange: (value: string) => void;
  onCreatorChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onReleasedDateChange: (value: Date | undefined) => void;
  onTagsChange: (value: string) => void;
  onNoteChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-title`}>Title</label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Video title"
          maxLength={300}
          className="!h-11"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-creator`}>Creator</label>
        <Input
          id={`${idPrefix}-creator`}
          value={creator}
          onChange={(event) => onCreatorChange(event.target.value)}
          placeholder="Channel or creator"
          maxLength={200}
          className="!h-11"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-source`}>Source URL</label>
        <Input
          id={`${idPrefix}-source`}
          type="url"
          value={sourceUrl}
          onChange={(event) => onSourceUrlChange(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="!h-11"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-released`}>Released</label>
        <DatePicker
          id={`${idPrefix}-released`}
          date={releasedDate}
          onChange={onReleasedDateChange}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-tags`}>Tags</label>
        <Input
          id={`${idPrefix}-tags`}
          value={tags}
          onChange={(event) => onTagsChange(event.target.value)}
          placeholder="golf, long form, challenge"
          className="!h-11"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated — what kind of footage this is.
        </p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-note`}>Note</label>
        <textarea
          id={`${idPrefix}-note`}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Good moments, timestamps, clip ideas"
          maxLength={2200}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}

export default function ClippingPage() {
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ClipDraft>(emptyDraft);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSource, setEditSource] = useState<ClipSource | null>(null);
  const [editDraft, setEditDraft] = useState<ClipDraft>(emptyDraft);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewSource, setViewSource] = useState<ClipSource | null>(null);
  const [viewPlaying, setViewPlaying] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeSource, setRemoveSource] = useState<ClipSource | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/clipping");
      const data = (await response.json()) as {
        sources?: ClipSource[];
        error?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not load clipping sources.");
        return;
      }
      setSources(data.sources ?? []);
    } catch {
      setError("Could not load clipping sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  function onAddOpenChange(next: boolean) {
    setAddOpen(next);
    if (next) {
      setError("");
      setDraft(emptyDraft);
    }
  }

  function onViewOpenChange(next: boolean) {
    setViewOpen(next);
    if (!next) {
      setViewPlaying(false);
    }
  }

  function openViewer(source: ClipSource) {
    setError("");
    setViewSource(source);
    setViewPlaying(false);
    setViewOpen(true);
  }

  function openEditor(source: ClipSource) {
    setError("");
    setEditSource(source);
    setEditDraft({
      title: source.title,
      creator: source.creator ?? "",
      sourceUrl: source.sourceUrl ?? "",
      note: source.note ?? "",
      tags: (source.tags ?? []).join(", "),
      releasedDate: isoDateToLocalDate(source.releasedDate),
      file: null,
    });
    setEditOpen(true);
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!draft.file) {
      setError("Upload a video.");
      return;
    }
    const contentType = resolveContentType(draft.file);
    if (!contentType) {
      setError("Upload an MP4, MOV, WEBM, or MKV video.");
      return;
    }
    if (draft.file.size > VIDEO_MAX_BYTES) {
      setError("That video is too large.");
      return;
    }
    const title = draft.title.trim() || draft.file.name.replace(/\.[^.]+$/, "");
    const fileSize = draft.file.size;
    setSaving(true);
    setUploadPercent(0);
    try {
      const { video, thumbnail, duration } = await uploadVideoToR2(
        draft.file,
        contentType,
        setUploadPercent,
      );
      const response = await fetch("/api/clipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          creator: draft.creator,
          sourceUrl: draft.sourceUrl,
          note: draft.note,
          tags: draft.tags,
          releasedDate: draft.releasedDate
            ? localDateToIsoDate(draft.releasedDate)
            : "",
          durationSeconds: Math.round(duration),
          sizeBytes: fileSize,
          video,
          thumbnail,
        }),
      });
      const data = await readApiJson<{ source?: ClipSource; error?: string }>(
        response,
      );
      if (!response.ok || !data.source) {
        setError(data.error || "Could not add that video.");
        return;
      }
      setSources((current) => [data.source!, ...current]);
      setDraft(emptyDraft);
      setAddOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add that video.");
    } finally {
      setSaving(false);
      setUploadPercent(0);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editSource) {
      return;
    }
    setError("");
    if (!editDraft.title.trim()) {
      setError("Add a title.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/clipping/${editSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDraft.title,
          creator: editDraft.creator,
          sourceUrl: editDraft.sourceUrl,
          note: editDraft.note,
          tags: editDraft.tags,
          releasedDate: editDraft.releasedDate
            ? localDateToIsoDate(editDraft.releasedDate)
            : "",
        }),
      });
      const data = (await response.json()) as {
        source?: ClipSource;
        error?: string;
      };
      if (!response.ok || !data.source) {
        setError(data.error || "Could not update that video.");
        return;
      }
      setSources((current) =>
        current.map((item) =>
          item.id === editSource.id ? data.source! : item,
        ),
      );
      setEditOpen(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not update that video.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    if (!removeSource) {
      return;
    }
    setError("");
    const response = await fetch(`/api/clipping/${removeSource.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not remove that video.");
      return;
    }
    setSources((current) =>
      current.filter((item) => item.id !== removeSource.id),
    );
    setRemoveOpen(false);
  }

  const clips = sources.filter((item) => item.kind === "clip");
  const sourceVideos = sources.filter((item) => item.kind !== "clip");
  const dialogOpen = addOpen || editOpen || removeOpen;

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clipping</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Long-form source videos to cut short clips out of.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">Add video</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add clipping source</DialogTitle>
              <DialogDescription>
                Upload a long-form video and label it for later clipping.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onAdd} className="grid gap-4">
              <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
                <ClipFields
                  idPrefix="add-clip"
                  title={draft.title}
                  creator={draft.creator}
                  sourceUrl={draft.sourceUrl}
                  releasedDate={draft.releasedDate}
                  tags={draft.tags}
                  note={draft.note}
                  onTitleChange={(title) => setDraft({ ...draft, title })}
                  onCreatorChange={(creator) => setDraft({ ...draft, creator })}
                  onSourceUrlChange={(sourceUrl) =>
                    setDraft({ ...draft, sourceUrl })
                  }
                  onReleasedDateChange={(releasedDate) =>
                    setDraft({ ...draft, releasedDate })
                  }
                  onTagsChange={(tags) => setDraft({ ...draft, tags })}
                  onNoteChange={(note) => setDraft({ ...draft, note })}
                />
                <div className="grid gap-1.5">
                  <span>Video file</span>
                  <VideoDrop
                    id="clipping-file"
                    file={draft.file}
                    onFile={(file) => setDraft({ ...draft, file })}
                  />
                </div>
              </div>
              {error ? (
                <p className="text-sm text-muted-foreground">{error}</p>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={saving || !draft.file}>
                  {saving
                    ? uploadPercent > 0 && uploadPercent < 100
                      ? `Uploading ${uploadPercent}%`
                      : "Adding"
                    : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && !dialogOpen ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      {!loading && sources.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No clipping sources yet.
        </p>
      ) : (
        <div className="mt-8">
          {clips.length > 0 ? (
            <div className="mb-10">
              <h2 className="text-sm font-medium">
                Clips{" "}
                <span className="text-muted-foreground">({clips.length})</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Vertical cuts with burned-in captions, ready to post.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => openViewer(clip)}
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
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {formatDuration(clip.durationSeconds)}
                      </span>
                    </span>
                    <span className="block p-2">
                      <span className="block truncate text-xs font-medium">
                        {clip.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {formatBytes(clip.sizeBytes)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {clips.length > 0 ? (
            <h2 className="mb-3 text-sm font-medium">Source videos</h2>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Video</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">Links</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 3 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-14 rounded-md" />
                          <Skeleton className="h-5 w-48" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Skeleton className="h-5 w-14 rounded-full" />
                          <Skeleton className="h-5 w-12 rounded-full" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-14" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                : sourceVideos.map((source) => (
                    <TableRow
                      key={source.id}
                      className="cursor-pointer"
                      onClick={() => openViewer(source)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <MediaThumb
                            media={source.thumbnail}
                            fallbackLabel={source.title}
                            size={56}
                            className="rounded-md"
                          />
                          <span className="min-w-0">
                            <span className="block max-w-[22rem] truncate">
                              {source.title}
                            </span>
                            {source.note ? (
                              <span
                                className="block max-w-[22rem] truncate text-xs text-muted-foreground"
                                title={source.note}
                              >
                                {source.note}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {source.creator || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatReleasedDate(source.releasedDate)}
                      </TableCell>
                      <TableCell>
                        {source.tags?.length ? (
                          <div className="flex max-w-[14rem] flex-wrap gap-1">
                            {source.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDuration(source.durationSeconds)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatBytes(source.sizeBytes)}
                      </TableCell>
                      <TableCell className="w-0 text-right">
                        {source.sourceUrl ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Open source"
                            title="Open source"
                          >
                            <a
                              href={source.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <LuLink />
                            </a>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={viewOpen} onOpenChange={onViewOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black">
              {viewSource ? (
                viewPlaying ? (
                  <video
                    className="max-h-[65vh] w-full object-contain"
                    src={buildCdnUrl(viewSource.video.path) ?? undefined}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setViewPlaying(true)}
                    className="group relative flex w-full cursor-pointer items-center justify-center"
                    aria-label="Play video"
                  >
                    {viewSource.thumbnail ? (
                      <Image
                        src={buildCdnUrl(viewSource.thumbnail.path) ?? ""}
                        alt=""
                        width={viewSource.thumbnail.width}
                        height={viewSource.thumbnail.height}
                        unoptimized
                        className="max-h-[65vh] w-full object-contain"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center text-sm text-white/60">
                        No preview
                      </div>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm transition group-hover:bg-black/70">
                        <LuPlay className="ml-0.5 size-6 fill-current" />
                      </span>
                    </span>
                  </button>
                )
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <DialogHeader className="pr-8">
                <DialogTitle>{viewSource?.title ?? "Clip source"}</DialogTitle>
                <DialogDescription>
                  {viewSource
                    ? [
                        viewSource.creator,
                        formatReleasedDate(viewSource.releasedDate),
                        formatDuration(viewSource.durationSeconds),
                        formatBytes(viewSource.sizeBytes),
                      ]
                        .filter((part) => part && part !== "—")
                        .join(" · ")
                    : null}
                </DialogDescription>
              </DialogHeader>

              {viewSource ? (
                <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
                  {viewSource.tags?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {viewSource.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Note
                    </span>
                    <p className="text-sm whitespace-pre-wrap">
                      {viewSource.note || (
                        <span className="text-muted-foreground">No note</span>
                      )}
                    </p>
                  </div>
                  {viewSource.transcript ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Transcript
                      </span>
                      <p className="text-sm whitespace-pre-wrap">
                        {viewSource.transcript}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter showCloseButton>
            {viewSource?.sourceUrl ? (
              <Button asChild variant="outline">
                <a
                  href={viewSource.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <LuLink />
                  View source
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => {
                if (!viewSource) {
                  return;
                }
                const source = viewSource;
                setViewOpen(false);
                setViewPlaying(false);
                openEditor(source);
              }}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit clipping source</DialogTitle>
            <DialogDescription>
              Update the details. The video file itself stays the same.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="grid gap-4">
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
              <ClipFields
                idPrefix="edit-clip"
                title={editDraft.title}
                creator={editDraft.creator}
                sourceUrl={editDraft.sourceUrl}
                releasedDate={editDraft.releasedDate}
                tags={editDraft.tags}
                note={editDraft.note}
                onTitleChange={(title) => setEditDraft({ ...editDraft, title })}
                onCreatorChange={(creator) =>
                  setEditDraft({ ...editDraft, creator })
                }
                onSourceUrlChange={(sourceUrl) =>
                  setEditDraft({ ...editDraft, sourceUrl })
                }
                onReleasedDateChange={(releasedDate) =>
                  setEditDraft({ ...editDraft, releasedDate })
                }
                onTagsChange={(tags) => setEditDraft({ ...editDraft, tags })}
                onNoteChange={(note) => setEditDraft({ ...editDraft, note })}
              />
            </div>
            {error ? (
              <p className="text-sm text-muted-foreground">{error}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => {
                  if (!editSource) {
                    return;
                  }
                  setError("");
                  setRemoveSource(editSource);
                  setEditOpen(false);
                  setRemoveOpen(true);
                }}
              >
                Delete
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !editDraft.title.trim() ||
                  (editSource !== null &&
                    editDraft.title === editSource.title &&
                    editDraft.creator === (editSource.creator ?? "") &&
                    editDraft.sourceUrl === (editSource.sourceUrl ?? "") &&
                    editDraft.note === (editSource.note ?? "") &&
                    editDraft.tags === (editSource.tags ?? []).join(", ") &&
                    (editDraft.releasedDate
                      ? localDateToIsoDate(editDraft.releasedDate)
                      : "") === (editSource.releasedDate ?? ""))
                }
              >
                {saving ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove clipping source</DialogTitle>
            <DialogDescription>
              Remove {removeSource ? `“${removeSource.title}”` : "this video"}?
              This deletes the file too and can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
