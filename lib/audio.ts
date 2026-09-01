import { randomUUID } from "crypto";
import { ObjectId, type Collection } from "mongodb";
import {
  createPresignedR2PutUrl,
  deleteFileFromCloudflare,
  ensureR2BrowserUploadCors,
  r2ObjectExists,
} from "./cloudflare";
import { getDb } from "./mongodb";

/**
 * Audio tracks are the sound library for the shirt videos: songs/clips saved
 * once in R2 and reused across scheduled posts.
 */
export type AudioFile = {
  path: string;
  size: number;
  contentType: string;
};

export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  sourceUrl: string;
  note: string;
  durationSeconds: number;
  audio: AudioFile;
  used: boolean;
};

type AudioTrackDoc = {
  title: string;
  artist?: string;
  sourceUrl?: string;
  note?: string;
  durationSeconds?: number;
  audio: AudioFile;
  used?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const TITLE_MAX = 300;
const ARTIST_MAX = 200;
const NOTE_MAX = 2200;
const URL_MAX = 600;

const AUDIO_FOLDER = "audio";
const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
const AUDIO_PATH_RE =
  /^audio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|aac|wav|ogg|webm|flac)$/i;

/** Browser-reported content types we accept, mapped to a stored extension. */
export const AUDIO_CONTENT_TYPE_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

export class AudioError extends Error {
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

/** Seconds, rounded; 0 means "unknown" and renders as an em dash. */
function normalizeDuration(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(num) || num <= 0 || num > 24 * 60 * 60) {
    return 0;
  }
  return Math.round(num);
}

function parseAudioFile(value: unknown): AudioFile | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as {
    path?: unknown;
    size?: unknown;
    contentType?: unknown;
  };
  if (typeof raw.path !== "string" || !AUDIO_PATH_RE.test(raw.path)) {
    return undefined;
  }
  const size =
    typeof raw.size === "number"
      ? raw.size
      : typeof raw.size === "string"
        ? Number(raw.size)
        : NaN;
  if (!Number.isFinite(size) || size <= 0 || size > AUDIO_MAX_BYTES) {
    return undefined;
  }
  const contentType =
    typeof raw.contentType === "string" && AUDIO_CONTENT_TYPE_EXT[raw.contentType]
      ? raw.contentType
      : "audio/mpeg";
  return { path: raw.path, size: Math.round(size), contentType };
}

function toAudioTrack(doc: AudioTrackDoc & { _id: ObjectId }): AudioTrack {
  return {
    id: doc._id.toHexString(),
    title: doc.title ?? "",
    artist: doc.artist ?? "",
    sourceUrl: doc.sourceUrl ?? "",
    note: doc.note ?? "",
    durationSeconds: doc.durationSeconds ?? 0,
    audio: doc.audio,
    used: doc.used === true,
  };
}

async function audioCollection(): Promise<Collection<AudioTrackDoc>> {
  const db = await getDb();
  return db.collection<AudioTrackDoc>("audio");
}

export async function listAudioTracks(): Promise<AudioTrack[]> {
  const collection = await audioCollection();
  const docs = await collection
    .find()
    .sort({ used: 1, createdAt: -1 })
    .toArray();
  return docs.map(toAudioTrack);
}

export type AudioUploadPlan = {
  path: string;
  uploadUrl: string;
};

export async function createAudioUpload(
  sizeValue: unknown,
  contentTypeValue: unknown,
): Promise<AudioUploadPlan> {
  const size =
    typeof sizeValue === "number"
      ? sizeValue
      : typeof sizeValue === "string"
        ? Number(sizeValue)
        : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    throw new AudioError("Upload an audio file.", 400);
  }
  if (size > AUDIO_MAX_BYTES) {
    throw new AudioError("That audio file is too large.", 400);
  }
  const contentType =
    typeof contentTypeValue === "string" ? contentTypeValue : "";
  const ext = AUDIO_CONTENT_TYPE_EXT[contentType];
  if (!ext) {
    throw new AudioError("Upload an MP3, M4A, WAV, OGG, or FLAC file.", 400);
  }

  await ensureR2BrowserUploadCors();
  const path = `${AUDIO_FOLDER}/${randomUUID()}.${ext}`;
  return { path, uploadUrl: createPresignedR2PutUrl(path) };
}

type AudioFields = {
  title?: unknown;
  artist?: unknown;
  sourceUrl?: unknown;
  note?: unknown;
  durationSeconds?: unknown;
  audio?: unknown;
  used?: unknown;
};

export async function createAudioTrack(
  fields: AudioFields,
): Promise<AudioTrack> {
  const audio = parseAudioFile(fields.audio);
  if (!audio) {
    throw new AudioError("Upload an audio file.", 400);
  }
  if (!(await r2ObjectExists(audio.path))) {
    throw new AudioError("Could not upload that audio file.", 400);
  }
  const title = normalizeText(fields.title, TITLE_MAX);
  if (!title) {
    throw new AudioError("Add a title.", 400);
  }

  const now = new Date();
  const doc: AudioTrackDoc = {
    title,
    artist: normalizeText(fields.artist, ARTIST_MAX),
    sourceUrl: normalizeHttpUrl(fields.sourceUrl),
    note: normalizeText(fields.note, NOTE_MAX),
    durationSeconds: normalizeDuration(fields.durationSeconds),
    audio,
    used: fields.used === true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const collection = await audioCollection();
    const result = await collection.insertOne(doc);
    return toAudioTrack({ ...doc, _id: result.insertedId });
  } catch (error) {
    await deleteFileFromCloudflare(audio.path).catch(() => undefined);
    throw error;
  }
}

export async function updateAudioTrack(
  rawId: string,
  fields: AudioFields,
): Promise<AudioTrack> {
  const id = parseId(rawId);
  if (!id) {
    throw new AudioError("Audio track not found.", 404);
  }

  const update: Partial<AudioTrackDoc> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (fields.title !== undefined) {
    const title = normalizeText(fields.title, TITLE_MAX);
    if (!title) {
      throw new AudioError("Add a title.", 400);
    }
    update.title = title;
  }
  if (fields.artist !== undefined) {
    update.artist = normalizeText(fields.artist, ARTIST_MAX);
  }
  if (fields.sourceUrl !== undefined) {
    update.sourceUrl = normalizeHttpUrl(fields.sourceUrl);
  }
  if (fields.note !== undefined) {
    update.note = normalizeText(fields.note, NOTE_MAX);
  }
  if (fields.durationSeconds !== undefined) {
    update.durationSeconds = normalizeDuration(fields.durationSeconds);
  }
  if (fields.used !== undefined) {
    update.used = fields.used === true;
  }

  const collection = await audioCollection();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!result) {
    throw new AudioError("Audio track not found.", 404);
  }
  return toAudioTrack(result);
}

export async function deleteAudioTrack(rawId: string): Promise<void> {
  const id = parseId(rawId);
  if (!id) {
    throw new AudioError("Audio track not found.", 404);
  }
  const collection = await audioCollection();
  const doc = await collection.findOne({ _id: id });
  if (!doc) {
    throw new AudioError("Audio track not found.", 404);
  }
  await collection.deleteOne({ _id: id });
  if (doc.audio?.path) {
    await deleteFileFromCloudflare(doc.audio.path).catch(() => undefined);
  }
}
