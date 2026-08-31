"use client";

import { DragEvent, FormEvent, useEffect, useState } from "react";
import { format } from "date-fns";
import { LuFileVideo, LuPencil, LuTrash2, LuUpload } from "react-icons/lu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildCdnUrl } from "@/lib/cdn";
import { cn } from "@/lib/utils";
import { AccountLogoThumb } from "@/components/account-logo";
import { MediaThumb } from "@/components/media-thumb";

type AccountLogo = {
  path: string;
  width: number;
  height: number;
};

type Account = {
  id: string;
  name: string;
  logo: AccountLogo | null;
};

type ScheduledVideo = {
  path: string;
  width: number;
  height: number;
};

type ScheduledThumbnail = {
  path: string;
  width: number;
  height: number;
};

type ScheduledItem = {
  id: string;
  accountId: string;
  video: ScheduledVideo;
  thumbnail: ScheduledThumbnail | null;
  scheduledDate: string;
  posted: boolean;
};

type ScheduleDraft = {
  accountId: string;
  scheduledDate?: Date;
  file: File | null;
};

const emptyDraft: ScheduleDraft = {
  accountId: "",
  scheduledDate: undefined,
  file: null,
};

const MP4_MAX_BYTES = 100 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 6;

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.status === 413
        ? "That video is too large."
        : "Could not add that item.",
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
    xhr.timeout = 10 * 60 * 1000;
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

type UploadPlan = {
  path?: string;
  strategy?: "put" | "multipart";
  uploadUrl?: string;
  uploadId?: string;
  partSize?: number;
  parts?: { partNumber: number; uploadUrl: string }[];
  error?: string;
};

function readVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that video."));
    };
    video.src = url;
  });
}

/** Draws the video's first frame onto a canvas and returns it as a JPEG blob. */
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
      // Nudge to the very first frame; on some codecs frame 0 isn't decoded
      // until a seek is requested.
      try {
        video.currentTime = 0;
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
): Promise<ScheduledThumbnail> {
  const planResponse = await fetch("/api/schedule/thumbnail", {
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
    throw new Error(plan.error || "Could not upload that video's thumbnail.");
  }
  await putBlob(plan.uploadUrl, blob);
  return { path: plan.path, width, height };
}

async function uploadFileToR2(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ video: ScheduledVideo; thumbnail: ScheduledThumbnail | null }> {
  const dimensionsPromise = readVideoDimensions(file);
  const thumbnailPromise = captureFirstFrame(file)
    .then(({ blob, width, height }) => uploadThumbnail(blob, width, height))
    .catch(() => null);
  const uploadResponse = await fetch("/api/schedule/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: file.size,
      contentType: file.type || "video/mp4",
    }),
  });
  const plan = await readApiJson<UploadPlan>(uploadResponse);
  if (!uploadResponse.ok || !plan.path) {
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
          const blob = file.slice(start, Math.min(start + plan.partSize!, file.size));
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
      const completeResponse = await fetch("/api/schedule/upload/complete", {
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
      const { width, height } = await dimensionsPromise;
      const thumbnail = await thumbnailPromise;
      return { video: { path: completeData.path, width, height }, thumbnail };
    } catch (error) {
      await fetch("/api/schedule/upload/abort", {
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
  const { width, height } = await dimensionsPromise;
  const thumbnail = await thumbnailPromise;
  return { video: { path: plan.path, width, height }, thumbnail };
}

function selectedDateToUtcDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUtcDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return iso;
  }
  return format(
    new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    "MMMM d, yyyy",
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function utcDayToLocalDate(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return undefined;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function ScheduleFields({
  idPrefix,
  accounts,
  accountId,
  scheduledDate,
  onAccountIdChange,
  onScheduledDateChange,
}: {
  idPrefix: string;
  accounts: Account[];
  accountId: string;
  scheduledDate?: Date;
  onAccountIdChange: (accountId: string) => void;
  onScheduledDateChange: (scheduledDate: Date | undefined) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-account`}>Account</label>
        <Select
          value={accountId || undefined}
          onValueChange={onAccountIdChange}
        >
          <SelectTrigger id={`${idPrefix}-account`} className="h-11 w-full">
            <SelectValue placeholder="Pick an account" />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="z-[60]">
            {accounts.map((account) => (
              <SelectItem
                key={account.id}
                value={account.id}
                className="gap-3 py-2"
              >
                <AccountLogoThumb
                  logo={account.logo}
                  name={account.name}
                  size={28}
                  className="rounded-md"
                />
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-date`}>Scheduled date</label>
        <DatePicker
          id={`${idPrefix}-date`}
          date={scheduledDate}
          onChange={onScheduledDateChange}
        />
      </div>
    </div>
  );
}

function FileDrop({
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
        accept="video/mp4,.mp4"
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <LuFileVideo size={20} aria-hidden />
          <p className="mt-2 max-w-full truncate text-sm font-medium">{file.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </>
      ) : (
        <>
          <LuUpload size={20} className="text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm">Drop an MP4 here, or click to pick one</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Up to 100 MB</p>
        </>
      )}
    </label>
  );
}

export default function SchedulePage() {
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledItem | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleDraft>(emptyDraft);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeItem, setRemoveItem] = useState<ScheduledItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/schedule").then(async (response) => {
        const data = (await response.json()) as {
          items?: ScheduledItem[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load schedule.");
        }
        setItems(data.items ?? []);
      }),
      fetch("/api/accounts").then(async (response) => {
        const data = (await response.json()) as {
          accounts?: Account[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load accounts.");
        }
        setAccounts(data.accounts ?? []);
      }),
    ])
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load schedule.");
      })
      .finally(() => setLoading(false));
  }, []);

  function onAddOpenChange(next: boolean) {
    setAddOpen(next);
    if (next) {
      setError("");
      setDraft(emptyDraft);
    }
  }

  function onEditOpenChange(next: boolean) {
    setEditOpen(next);
    if (next) {
      setError("");
    }
  }

  function onRemoveOpenChange(next: boolean) {
    setRemoveOpen(next);
    if (next) {
      setError("");
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!draft.accountId) {
      setError("Pick an account.");
      return;
    }
    if (!draft.scheduledDate) {
      setError("Pick a date.");
      return;
    }
    if (!draft.file) {
      setError("Upload an MP4.");
      return;
    }
    if (!draft.file.name.toLowerCase().endsWith(".mp4")) {
      setError("Upload an MP4.");
      return;
    }
    if (draft.file.size > MP4_MAX_BYTES) {
      setError("That video is too large.");
      return;
    }
    setSaving(true);
    setUploadPercent(0);
    try {
      const { video, thumbnail } = await uploadFileToR2(draft.file, setUploadPercent);
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: draft.accountId,
          scheduledDate: selectedDateToUtcDay(draft.scheduledDate),
          video,
          thumbnail,
        }),
      });
      const data = await readApiJson<{
        item?: ScheduledItem;
        error?: string;
      }>(response);
      if (!response.ok || !data.item) {
        setError(data.error || "Could not add that item.");
        return;
      }
      setItems((current) => [data.item!, ...current]);
      setDraft(emptyDraft);
      setAddOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add that item.");
    } finally {
      setSaving(false);
      setUploadPercent(0);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editItem) {
      return;
    }
    setError("");
    if (!editDraft.accountId) {
      setError("Pick an account.");
      return;
    }
    if (!editDraft.scheduledDate) {
      setError("Pick a date.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/schedule/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: editDraft.accountId,
          scheduledDate: selectedDateToUtcDay(editDraft.scheduledDate),
        }),
      });
      const data = (await response.json()) as {
        item?: ScheduledItem;
        error?: string;
      };
      if (!response.ok || !data.item) {
        setError(data.error || "Could not update that item.");
        return;
      }
      setItems((current) =>
        current
          .map((item) => (item.id === editItem.id ? data.item! : item))
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
      );
      setEditOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update that item.");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    if (!removeItem) {
      return;
    }
    setError("");
    const response = await fetch(`/api/schedule/${removeItem.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not remove that item.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== removeItem.id));
    setRemoveOpen(false);
  }

  const dialogOpen = addOpen || editOpen || removeOpen;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">Add item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add scheduled item</DialogTitle>
              <DialogDescription>
                Pick an account, a date, and upload an MP4 up to 100 MB.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onAdd} className="grid gap-4">
              <div className="grid gap-3">
                <ScheduleFields
                  idPrefix="add-schedule"
                  accounts={accounts}
                  accountId={draft.accountId}
                  scheduledDate={draft.scheduledDate}
                  onAccountIdChange={(accountId) =>
                    setDraft({ ...draft, accountId })
                  }
                  onScheduledDateChange={(scheduledDate) =>
                    setDraft({ ...draft, scheduledDate })
                  }
                />
                <div className="grid gap-1.5">
                  <span>Video (MP4)</span>
                  <FileDrop
                    id="schedule-file"
                    file={draft.file}
                    onFile={(file) => setDraft({ ...draft, file })}
                  />
                </div>
              </div>
              {error ? (
                <p className="text-sm text-muted-foreground">{error}</p>
              ) : null}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={
                    saving ||
                    !draft.accountId ||
                    !draft.scheduledDate ||
                    !draft.file
                  }
                >
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

      {loading ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading schedule.
        </p>
      ) : items.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No scheduled items yet.
        </p>
      ) : (
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Video</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Scheduled date</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const src = buildCdnUrl(item.video.path);
                const label = formatUtcDay(item.scheduledDate);
                const accountName =
                  accounts.find((account) => account.id === item.accountId)
                    ?.name ?? "—";
                const accountLogo =
                  accounts.find((account) => account.id === item.accountId)
                    ?.logo ?? null;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.thumbnail ? (
                        <a
                          href={src ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                        >
                          <MediaThumb
                            media={item.thumbnail}
                            fallbackLabel={accountName}
                            size={56}
                            className="rounded-md"
                          />
                        </a>
                      ) : src ? (
                        <video
                          className="h-14 w-14 rounded-md bg-black/5 object-cover"
                          src={src}
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <span className="text-muted-foreground">{item.video.path}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <AccountLogoThumb
                          logo={accountLogo}
                          name={accountName}
                          size={32}
                          className="rounded-lg"
                        />
                        {accountName}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{label}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${label}`}
                          onClick={() => {
                            setError("");
                            setEditItem(item);
                            setEditDraft({
                              accountId: item.accountId,
                              scheduledDate: utcDayToLocalDate(item.scheduledDate),
                              file: null,
                            });
                            setEditOpen(true);
                          }}
                        >
                          <LuPencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${label}`}
                          onClick={() => {
                            setError("");
                            setRemoveItem(item);
                            setRemoveOpen(true);
                          }}
                        >
                          <LuTrash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={onEditOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit scheduled item</DialogTitle>
            <DialogDescription>
              Update the account and scheduled date.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="grid gap-4">
            <ScheduleFields
              idPrefix="edit-schedule"
              accounts={accounts}
              accountId={editDraft.accountId}
              scheduledDate={editDraft.scheduledDate}
              onAccountIdChange={(accountId) =>
                setEditDraft({ ...editDraft, accountId })
              }
              onScheduledDateChange={(scheduledDate) =>
                setEditDraft({ ...editDraft, scheduledDate })
              }
            />
            {error ? (
              <p className="text-sm text-muted-foreground">{error}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !editDraft.accountId ||
                  !editDraft.scheduledDate ||
                  (editItem !== null &&
                    editDraft.accountId === editItem.accountId &&
                    editDraft.scheduledDate !== undefined &&
                    selectedDateToUtcDay(editDraft.scheduledDate) ===
                      editItem.scheduledDate.slice(0, 10))
                }
              >
                {saving ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={onRemoveOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove scheduled item</DialogTitle>
            <DialogDescription>
              Remove the item for {removeItem ? formatUtcDay(removeItem.scheduledDate) : "this date"}?
              This can&apos;t be undone.
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
