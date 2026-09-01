"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { LuDownload, LuLink, LuMusic, LuUpload } from "react-icons/lu";
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
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCdnUrl } from "@/lib/cdn";
import { cn } from "@/lib/utils";

type AudioFile = {
  path: string;
  size: number;
  contentType: string;
};

type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  sourceUrl: string;
  note: string;
  tags: string[];
  releasedDate: string;
  durationSeconds: number;
  audio: AudioFile;
  used: boolean;
};

type AudioDraft = {
  title: string;
  artist: string;
  sourceUrl: string;
  note: string;
  tags: string;
  releasedDate?: Date;
  file: File | null;
};

const emptyDraft: AudioDraft = {
  title: "",
  artist: "",
  sourceUrl: "",
  note: "",
  tags: "",
  releasedDate: undefined,
  file: null,
};

const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

const ACCEPTED_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
]);

const EXT_CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
};

/** Browsers sometimes report "" or a generic type; fall back to the extension. */
function resolveContentType(file: File): string {
  if (file.type && ACCEPTED_CONTENT_TYPES.has(file.type)) {
    return file.type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_CONTENT_TYPES[ext] ?? "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 0 means unknown (metadata unreadable) — callers render an em dash. */
function formatDuration(seconds: number): string {
  if (!seconds) {
    return "—";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
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

/** A local Date -> "YYYY-MM-DD" using local calendar fields (no UTC shift). */
function localDateToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Renders a stored "YYYY-MM-DD" without constructing a UTC-shifted Date. */
function formatReleasedDate(iso: string): string {
  const local = isoDateToLocalDate(iso);
  return local ? format(local, "MMM d, yyyy") : "\u2014";
}

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.status === 413
        ? "That audio file is too large."
        : "Could not add that track.",
    );
  }
}

function putBlob(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error("Could not upload that audio file."));
    };
    xhr.onerror = () => reject(new Error("Could not upload that audio file."));
    xhr.ontimeout = () => reject(new Error("Could not upload that audio file."));
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(blob);
  });
}

async function uploadAudioToR2(
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<AudioFile> {
  const planResponse = await fetch("/api/audio/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size, contentType }),
  });
  const plan = await readApiJson<{
    path?: string;
    uploadUrl?: string;
    error?: string;
  }>(planResponse);
  if (!planResponse.ok || !plan.path || !plan.uploadUrl) {
    throw new Error(plan.error || "Could not upload that audio file.");
  }
  await putBlob(plan.uploadUrl, file, contentType, (loaded) => {
    onProgress(Math.min(100, Math.round((loaded / file.size) * 100)));
  });
  onProgress(100);
  return { path: plan.path, size: file.size, contentType };
}

function AudioDrop({
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
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <LuMusic size={20} aria-hidden />
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
            Drop an audio file here, or click to pick one
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            MP3, M4A, WAV, OGG, or FLAC — up to 50 MB
          </p>
        </>
      )}
    </label>
  );
}

function AudioFields({
  idPrefix,
  title,
  artist,
  sourceUrl,
  note,
  tags,
  releasedDate,
  onTitleChange,
  onArtistChange,
  onSourceUrlChange,
  onNoteChange,
  onTagsChange,
  onReleasedDateChange,
}: {
  idPrefix: string;
  title: string;
  artist: string;
  sourceUrl: string;
  note: string;
  tags: string;
  releasedDate?: Date;
  onTitleChange: (value: string) => void;
  onArtistChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onReleasedDateChange: (value: Date | undefined) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-title`}>Title</label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Track name"
          maxLength={300}
          className="!h-11"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-artist`}>Artist</label>
        <Input
          id={`${idPrefix}-artist`}
          value={artist}
          onChange={(event) => onArtistChange(event.target.value)}
          placeholder="Artist or creator"
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
          placeholder="ambient, lo-fi, anime edit"
          className="!h-11"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated — the kind of audio this is.
        </p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-note`}>Note</label>
        <textarea
          id={`${idPrefix}-note`}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Where it works, vibe, timestamps"
          maxLength={2200}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}

export default function AudioPage() {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<AudioDraft>(emptyDraft);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTrack, setEditTrack] = useState<AudioTrack | null>(null);
  const [editDraft, setEditDraft] = useState<AudioDraft>(emptyDraft);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTrack, setRemoveTrack] = useState<AudioTrack | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/audio");
      const data = (await response.json()) as {
        tracks?: AudioTrack[];
        error?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not load audio.");
        return;
      }
      setTracks(data.tracks ?? []);
    } catch {
      setError("Could not load audio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  function onAddOpenChange(next: boolean) {
    setAddOpen(next);
    if (next) {
      setError("");
      setDraft(emptyDraft);
    }
  }

  function openEditor(track: AudioTrack) {
    setError("");
    setEditTrack(track);
    setEditDraft({
      title: track.title,
      artist: track.artist ?? "",
      sourceUrl: track.sourceUrl ?? "",
      note: track.note ?? "",
      tags: (track.tags ?? []).join(", "),
      releasedDate: isoDateToLocalDate(track.releasedDate),
      file: null,
    });
    setEditOpen(true);
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!draft.file) {
      setError("Upload an audio file.");
      return;
    }
    const contentType = resolveContentType(draft.file);
    if (!contentType) {
      setError("Upload an MP3, M4A, WAV, OGG, or FLAC file.");
      return;
    }
    if (draft.file.size > AUDIO_MAX_BYTES) {
      setError("That audio file is too large.");
      return;
    }
    const title = draft.title.trim() || draft.file.name.replace(/\.[^.]+$/, "");
    setSaving(true);
    setUploadPercent(0);
    try {
      const durationPromise = readAudioDuration(draft.file);
      const audio = await uploadAudioToR2(
        draft.file,
        contentType,
        setUploadPercent,
      );
      const durationSeconds = await durationPromise;
      const response = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist: draft.artist,
          sourceUrl: draft.sourceUrl,
          note: draft.note,
          tags: draft.tags,
          releasedDate: draft.releasedDate
            ? localDateToIsoDate(draft.releasedDate)
            : "",
          durationSeconds,
          audio,
        }),
      });
      const data = await readApiJson<{ track?: AudioTrack; error?: string }>(
        response,
      );
      if (!response.ok || !data.track) {
        setError(data.error || "Could not add that track.");
        return;
      }
      setTracks((current) => [data.track!, ...current]);
      setDraft(emptyDraft);
      setAddOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add that track.");
    } finally {
      setSaving(false);
      setUploadPercent(0);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTrack) {
      return;
    }
    setError("");
    if (!editDraft.title.trim()) {
      setError("Add a title.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/audio/${editTrack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDraft.title,
          artist: editDraft.artist,
          sourceUrl: editDraft.sourceUrl,
          note: editDraft.note,
          tags: editDraft.tags,
          releasedDate: editDraft.releasedDate
            ? localDateToIsoDate(editDraft.releasedDate)
            : "",
        }),
      });
      const data = (await response.json()) as {
        track?: AudioTrack;
        error?: string;
      };
      if (!response.ok || !data.track) {
        setError(data.error || "Could not update that track.");
        return;
      }
      setTracks((current) =>
        current.map((track) =>
          track.id === editTrack.id ? data.track! : track,
        ),
      );
      setEditOpen(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not update that track.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    if (!removeTrack) {
      return;
    }
    setError("");
    const response = await fetch(`/api/audio/${removeTrack.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not remove that track.");
      return;
    }
    setTracks((current) =>
      current.filter((track) => track.id !== removeTrack.id),
    );
    setRemoveOpen(false);
  }

  const dialogOpen = addOpen || editOpen || removeOpen;

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sound library for the videos — upload once, reuse anywhere.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">Add audio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add audio</DialogTitle>
              <DialogDescription>
                Upload an audio file up to 50 MB and label it.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onAdd} className="grid gap-4">
              <div className="grid gap-3">
                <AudioFields
                  idPrefix="add-audio"
                  title={draft.title}
                  artist={draft.artist}
                  sourceUrl={draft.sourceUrl}
                  note={draft.note}
                  tags={draft.tags}
                  releasedDate={draft.releasedDate}
                  onTitleChange={(title) => setDraft({ ...draft, title })}
                  onArtistChange={(artist) => setDraft({ ...draft, artist })}
                  onSourceUrlChange={(sourceUrl) =>
                    setDraft({ ...draft, sourceUrl })
                  }
                  onNoteChange={(note) => setDraft({ ...draft, note })}
                  onTagsChange={(tags) => setDraft({ ...draft, tags })}
                  onReleasedDateChange={(releasedDate) =>
                    setDraft({ ...draft, releasedDate })
                  }
                />
                <div className="grid gap-1.5">
                  <span>Audio file</span>
                  <AudioDrop
                    id="audio-file"
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

      {!loading && tracks.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No audio saved yet.
        </p>
      ) : (
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">Links</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-10 rounded-md" />
                          <Skeleton className="h-5 w-40" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
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
                        <Skeleton className="h-5 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-9 w-56" />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                : tracks.map((track) => {
                    const src = buildCdnUrl(track.audio.path);
                    return (
                      <TableRow
                        key={track.id}
                        className="cursor-pointer"
                        onClick={() => openEditor(track)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-black/5 text-muted-foreground">
                              <LuMusic size={18} aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="block max-w-[20rem] truncate">
                                {track.title}
                              </span>
                              {track.note ? (
                                <span
                                  className="block max-w-[20rem] truncate text-xs text-muted-foreground"
                                  title={track.note}
                                >
                                  {track.note}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.artist || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatReleasedDate(track.releasedDate)}
                        </TableCell>
                        <TableCell>
                          {track.tags?.length ? (
                            <div className="flex max-w-[16rem] flex-wrap gap-1">
                              {track.tags.map((tag) => (
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
                        <TableCell className="text-muted-foreground">
                          {formatDuration(track.durationSeconds)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatBytes(track.audio.size)}
                        </TableCell>
                        <TableCell>
                          {src ? (
                            <audio
                              src={src}
                              controls
                              preload="none"
                              className="h-9 w-56 max-w-full"
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="w-0 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {track.sourceUrl ? (
                              <Button
                                asChild
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Open source"
                                title="Open source"
                              >
                                <a
                                  href={track.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <LuLink />
                                </a>
                              </Button>
                            ) : null}
                            {src ? (
                              <Button
                                asChild
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Download audio"
                                title="Download audio"
                              >
                                <a
                                  href={src}
                                  download
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <LuDownload />
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit audio</DialogTitle>
            <DialogDescription>
              Update the track&apos;s details. The file itself stays the same.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="grid gap-4">
            <AudioFields
              idPrefix="edit-audio"
              title={editDraft.title}
              artist={editDraft.artist}
              sourceUrl={editDraft.sourceUrl}
              note={editDraft.note}
              tags={editDraft.tags}
              releasedDate={editDraft.releasedDate}
              onTitleChange={(title) => setEditDraft({ ...editDraft, title })}
              onArtistChange={(artist) =>
                setEditDraft({ ...editDraft, artist })
              }
              onSourceUrlChange={(sourceUrl) =>
                setEditDraft({ ...editDraft, sourceUrl })
              }
              onNoteChange={(note) => setEditDraft({ ...editDraft, note })}
              onTagsChange={(tags) => setEditDraft({ ...editDraft, tags })}
              onReleasedDateChange={(releasedDate) =>
                setEditDraft({ ...editDraft, releasedDate })
              }
            />
            {error ? (
              <p className="text-sm text-muted-foreground">{error}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => {
                  if (!editTrack) {
                    return;
                  }
                  setError("");
                  setRemoveTrack(editTrack);
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
                  (editTrack !== null &&
                    editDraft.title === editTrack.title &&
                    editDraft.artist === (editTrack.artist ?? "") &&
                    editDraft.sourceUrl === (editTrack.sourceUrl ?? "") &&
                    editDraft.note === (editTrack.note ?? "") &&
                    editDraft.tags === (editTrack.tags ?? []).join(", ") &&
                    (editDraft.releasedDate
                      ? localDateToIsoDate(editDraft.releasedDate)
                      : "") === (editTrack.releasedDate ?? ""))
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
            <DialogTitle>Remove audio</DialogTitle>
            <DialogDescription>
              Remove {removeTrack ? `“${removeTrack.title}”` : "this track"}?
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
