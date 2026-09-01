import { randomUUID } from "crypto";
import { ObjectId, type Collection } from "mongodb";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createPresignedR2PutUrl,
  deleteFileFromCloudflare,
  ensureR2BrowserUploadCors,
  r2ObjectExists,
} from "./cloudflare";
import { getDb } from "./mongodb";
import {
  createImageUploadPlan,
  type ImageUploadPlan,
  type MediaRef,
  parseOptionalMediaRef,
  parseRequiredMediaRef,
} from "./media";

/**
 * Clipping sources are the long-form videos we cut short clips out of, so
 * these are much larger than scheduled posts (multi-GB 4K masters).
 */
export type ClipSource = {
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
};

type ClipSourceDoc = {
  title: string;
  creator?: string;
  sourceUrl?: string;
  note?: string;
  tags?: string[];
  releasedDate?: Date | null;
  durationSeconds?: number;
  sizeBytes?: number;
  video: MediaRef;
  thumbnail?: MediaRef | null;
  clipped?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const TITLE_MAX = 300;
const CREATOR_MAX = 200;
const NOTE_MAX = 2200;
const URL_MAX = 600;
const TAG_MAX = 40;
const TAGS_MAX = 20;

const VIDEO_FOLDER = "clipping";
const THUMBNAIL_FOLDER = "clipping-thumbnails";
/** 4K masters run multi-GB, so this ceiling is far above the schedule's. */
const VIDEO_MAX_BYTES = 16 * 1024 * 1024 * 1024;
const THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024;
/**
 * 8 MB parts. Larger bodies (16 MB and 64 MB) reliably failed mid-transfer
 * with TLS "bad record mac" / broken pipe on this upload path — the same URL
 * accepts an 8 MB body fine, so the limit is body size, not the signed URL.
 * 8 MB also stays above R2's 5 MB per-part minimum and keeps a 16 GB master
 * (~2,048 parts) well under the 10,000-part cap.
 */
const MULTIPART_PART_BYTES = 8 * 1024 * 1024;
/** Large uploads take far longer than the default 15m presign window. */
const UPLOAD_URL_EXPIRES_SECONDS = 12 * 60 * 60;

const CLIPPING_PATH_RE =
  /^clipping\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|mkv)$/i;
const CLIPPING_THUMBNAIL_PATH_RE =
  /^clipping-thumbnails\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;

const VIDEO_CONTENT_TYPE_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "application/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "application/octet-stream": "mp4",
};

export class ClippingError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parseId(value: string): ObjectId | null {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) {
    return null;
  }
  return new ObjectId(value);
}

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return trimmed.slice(0, URL_MAX);
  } catch {
    return "";
  }
}

/** Tag list: trimmed, lowercased, deduped, capped. Accepts an array or CSV. */
function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const tag = entry.trim().toLowerCase().slice(0, TAG_MAX);
    if (tag) {
      seen.add(tag);
    }
    if (seen.size >= TAGS_MAX) {
      break;
    }
  }
  return Array.from(seen);
}

/** Stored as a UTC-midnight Date; unparseable input becomes null. */
function normalizeReleasedDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function releasedDateToIso(value: Date | null | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  return value.toISOString().slice(0, 10);
}

/** Non-negative integer; 0 means "unknown" and renders as an em dash. */
function normalizeCount(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return Math.round(num);
}

function toClipSource(doc: ClipSourceDoc & { _id: ObjectId }): ClipSource {
  return {
    id: doc._id.toHexString(),
    title: doc.title ?? "",
    creator: doc.creator ?? "",
    sourceUrl: doc.sourceUrl ?? "",
    note: doc.note ?? "",
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    releasedDate: releasedDateToIso(doc.releasedDate),
    durationSeconds: doc.durationSeconds ?? 0,
    sizeBytes: doc.sizeBytes ?? 0,
    video: doc.video,
    thumbnail: doc.thumbnail ?? null,
    clipped: doc.clipped === true,
  };
}

async function clippingCollection(): Promise<Collection<ClipSourceDoc>> {
  const db = await getDb();
  return db.collection<ClipSourceDoc>("clipping");
}

export async function listClipSources(): Promise<ClipSource[]> {
  const collection = await clippingCollection();
  const docs = await collection
    .find()
    .sort({ clipped: 1, createdAt: -1 })
    .toArray();
  return docs.map(toClipSource);
}

export type ClippingUploadPart = {
  partNumber: number;
  uploadUrl: string;
};

export type ClippingUploadPlan =
  | { path: string; strategy: "put"; uploadUrl: string }
  | {
      path: string;
      strategy: "multipart";
      uploadId: string;
      partSize: number;
      parts: ClippingUploadPart[];
    };

export async function createClippingUpload(
  sizeValue: unknown,
  contentTypeValue: unknown,
): Promise<ClippingUploadPlan> {
  const size =
    typeof sizeValue === "number"
      ? sizeValue
      : typeof sizeValue === "string"
        ? Number(sizeValue)
        : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    throw new ClippingError("Upload a video.", 400);
  }
  if (size > VIDEO_MAX_BYTES) {
    throw new ClippingError("That video is too large.", 400);
  }
  const contentType =
    typeof contentTypeValue === "string" ? contentTypeValue : "video/mp4";
  const ext = VIDEO_CONTENT_TYPE_EXT[contentType];
  if (!ext) {
    throw new ClippingError("Upload an MP4, MOV, WEBM, or MKV video.", 400);
  }

  await ensureR2BrowserUploadCors();
  const path = `${VIDEO_FOLDER}/${randomUUID()}.${ext}`;
  if (size <= MULTIPART_PART_BYTES) {
    return {
      path,
      strategy: "put",
      uploadUrl: createPresignedR2PutUrl(path, {}, UPLOAD_URL_EXPIRES_SECONDS),
    };
  }

  const uploadId = await createMultipartUpload(path, contentType);
  const partCount = Math.ceil(size / MULTIPART_PART_BYTES);
  return {
    path,
    strategy: "multipart",
    uploadId,
    partSize: MULTIPART_PART_BYTES,
    parts: Array.from({ length: partCount }, (_, index) => {
      const partNumber = index + 1;
      return {
        partNumber,
        uploadUrl: createPresignedR2PutUrl(
          path,
          { partNumber: String(partNumber), uploadId },
          UPLOAD_URL_EXPIRES_SECONDS,
        ),
      };
    }),
  };
}

export async function createClippingThumbnailUpload(
  sizeValue: unknown,
  contentTypeValue: unknown,
): Promise<ImageUploadPlan> {
  try {
    return await createImageUploadPlan(
      THUMBNAIL_FOLDER,
      sizeValue,
      contentTypeValue,
      THUMBNAIL_MAX_BYTES,
      {
        ensureCors: ensureR2BrowserUploadCors,
        presignPut: (path) => createPresignedR2PutUrl(path),
      },
    );
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      throw new ClippingError(
        error.message,
        (error as { status: number }).status,
      );
    }
    throw error;
  }
}

export async function completeClippingUpload(
  pathValue: unknown,
  uploadIdValue: unknown,
  partsValue: unknown,
): Promise<{ path: string }> {
  if (typeof pathValue !== "string" || !CLIPPING_PATH_RE.test(pathValue)) {
    throw new ClippingError("Upload a video.", 400);
  }
  const path = pathValue;
  if (typeof uploadIdValue !== "string" || !uploadIdValue) {
    throw new ClippingError("Could not upload that video.", 400);
  }
  if (!Array.isArray(partsValue) || partsValue.length === 0) {
    throw new ClippingError("Could not upload that video.", 400);
  }
  const parts = partsValue.map((part) => {
    if (
      !part ||
      typeof part !== "object" ||
      typeof part.partNumber !== "number" ||
      !Number.isInteger(part.partNumber) ||
      part.partNumber < 1 ||
      typeof part.etag !== "string" ||
      !part.etag
    ) {
      throw new ClippingError("Could not upload that video.", 400);
    }
    return { partNumber: part.partNumber, etag: part.etag };
  });
  try {
    await completeMultipartUpload(path, uploadIdValue, parts);
  } catch (error) {
    await abortMultipartUpload(path, uploadIdValue).catch(() => undefined);
    throw error;
  }
  return { path };
}

export async function abortClippingUpload(
  pathValue: unknown,
  uploadIdValue: unknown,
): Promise<void> {
  if (typeof pathValue !== "string" || !CLIPPING_PATH_RE.test(pathValue)) {
    throw new ClippingError("Upload a video.", 400);
  }
  if (typeof uploadIdValue !== "string" || !uploadIdValue) {
    throw new ClippingError("Could not upload that video.", 400);
  }
  await abortMultipartUpload(pathValue, uploadIdValue);
}

type ClippingFields = {
  title?: unknown;
  creator?: unknown;
  sourceUrl?: unknown;
  note?: unknown;
  tags?: unknown;
  releasedDate?: unknown;
  durationSeconds?: unknown;
  sizeBytes?: unknown;
  video?: unknown;
  thumbnail?: unknown;
  clipped?: unknown;
};

export async function createClipSource(
  fields: ClippingFields,
): Promise<ClipSource> {
  const video = parseRequiredMediaRef(fields.video, CLIPPING_PATH_RE);
  if (!video) {
    throw new ClippingError("Upload a video.", 400);
  }
  if (!(await r2ObjectExists(video.path))) {
    throw new ClippingError("Could not upload that video.", 400);
  }
  const thumbnail = parseOptionalMediaRef(
    fields.thumbnail,
    CLIPPING_THUMBNAIL_PATH_RE,
  );
  if (thumbnail === undefined) {
    throw new ClippingError("Could not save that video's thumbnail.", 400);
  }
  if (thumbnail && !(await r2ObjectExists(thumbnail.path))) {
    throw new ClippingError("Could not save that video's thumbnail.", 400);
  }
  const title = normalizeText(fields.title, TITLE_MAX);
  if (!title) {
    throw new ClippingError("Add a title.", 400);
  }

  const now = new Date();
  const doc: ClipSourceDoc = {
    title,
    creator: normalizeText(fields.creator, CREATOR_MAX),
    sourceUrl: normalizeHttpUrl(fields.sourceUrl),
    note: normalizeText(fields.note, NOTE_MAX),
    tags: normalizeTags(fields.tags),
    releasedDate: normalizeReleasedDate(fields.releasedDate),
    durationSeconds: normalizeCount(fields.durationSeconds),
    sizeBytes: normalizeCount(fields.sizeBytes),
    video,
    thumbnail,
    clipped: fields.clipped === true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const collection = await clippingCollection();
    const result = await collection.insertOne(doc);
    return toClipSource({ ...doc, _id: result.insertedId });
  } catch (error) {
    await deleteFileFromCloudflare(video.path).catch(() => undefined);
    if (thumbnail) {
      await deleteFileFromCloudflare(thumbnail.path).catch(() => undefined);
    }
    throw error;
  }
}

export async function updateClipSource(
  rawId: string,
  fields: ClippingFields,
): Promise<ClipSource> {
  const id = parseId(rawId);
  if (!id) {
    throw new ClippingError("Clip source not found.", 404);
  }

  const update: Partial<ClipSourceDoc> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (fields.title !== undefined) {
    const title = normalizeText(fields.title, TITLE_MAX);
    if (!title) {
      throw new ClippingError("Add a title.", 400);
    }
    update.title = title;
  }
  if (fields.creator !== undefined) {
    update.creator = normalizeText(fields.creator, CREATOR_MAX);
  }
  if (fields.sourceUrl !== undefined) {
    update.sourceUrl = normalizeHttpUrl(fields.sourceUrl);
  }
  if (fields.note !== undefined) {
    update.note = normalizeText(fields.note, NOTE_MAX);
  }
  if (fields.tags !== undefined) {
    update.tags = normalizeTags(fields.tags);
  }
  if (fields.releasedDate !== undefined) {
    update.releasedDate = normalizeReleasedDate(fields.releasedDate);
  }
  if (fields.clipped !== undefined) {
    update.clipped = fields.clipped === true;
  }

  const collection = await clippingCollection();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!result) {
    throw new ClippingError("Clip source not found.", 404);
  }
  return toClipSource(result);
}

export async function deleteClipSource(rawId: string): Promise<void> {
  const id = parseId(rawId);
  if (!id) {
    throw new ClippingError("Clip source not found.", 404);
  }
  const collection = await clippingCollection();
  const doc = await collection.findOne({ _id: id });
  if (!doc) {
    throw new ClippingError("Clip source not found.", 404);
  }
  await collection.deleteOne({ _id: id });
  if (doc.video?.path) {
    await deleteFileFromCloudflare(doc.video.path).catch(() => undefined);
  }
  if (doc.thumbnail?.path) {
    await deleteFileFromCloudflare(doc.thumbnail.path).catch(() => undefined);
  }
}
