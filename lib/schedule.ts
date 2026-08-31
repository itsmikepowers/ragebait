import { randomUUID } from "crypto";
import { ObjectId, type Collection } from "mongodb";
import { getAccount, getAccountByUsername } from "./accounts";
import { buildCdnUrl } from "./cdn";
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
import { type MediaRef, parseRequiredMediaRef } from "./media";

export type ScheduledVideo = MediaRef;

export type ScheduledItem = {
  id: string;
  accountId: string;
  video: ScheduledVideo;
  scheduledDate: string;
  posted: boolean;
};

export type PublicScheduledPost = {
  username: string;
  date: string;
  url: string | null;
  posted: boolean;
};

type ScheduledItemDoc = {
  accountId: ObjectId;
  video: ScheduledVideo;
  scheduledDate: Date;
  posted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const VIDEO_FOLDER = "schedule";
const MP4_MAX_BYTES = 100 * 1024 * 1024;
const MULTIPART_PART_BYTES = 5 * 1024 * 1024;
const SCHEDULE_PATH_RE =
  /^schedule\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i;

export type ScheduleUploadPart = {
  partNumber: number;
  uploadUrl: string;
};

export type ScheduleUploadPlan =
  | { path: string; strategy: "put"; uploadUrl: string }
  | {
      path: string;
      strategy: "multipart";
      uploadId: string;
      partSize: number;
      parts: ScheduleUploadPart[];
    };

export class ScheduleError extends Error {
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

function parseUtcDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim().slice(0, 10));
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

function toScheduledItem(
  doc: ScheduledItemDoc & { _id: ObjectId },
): ScheduledItem {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId?.toHexString?.() ?? "",
    video: doc.video,
    scheduledDate:
      doc.scheduledDate instanceof Date ? doc.scheduledDate.toISOString() : "",
    posted: doc.posted === true,
  };
}

async function parseScheduleFields(
  accountIdValue: unknown,
  scheduledDateValue: unknown,
): Promise<{ accountId: ObjectId; scheduledDate: Date }> {
  const scheduledDate = parseUtcDate(scheduledDateValue);
  if (!scheduledDate) {
    throw new ScheduleError("Pick a date.", 400);
  }
  const accountId =
    typeof accountIdValue === "string" ? parseId(accountIdValue) : null;
  if (!accountId) {
    throw new ScheduleError("Pick an account.", 400);
  }
  const account = await getAccount(accountId.toHexString());
  if (!account) {
    throw new ScheduleError("Pick an account.", 400);
  }
  return { accountId, scheduledDate };
}

function isAllowedVideoType(value: unknown): boolean {
  if (value == null || value === "") {
    return true;
  }
  return (
    value === "video/mp4" ||
    value === "application/mp4" ||
    value === "application/octet-stream"
  );
}

async function scheduleCollection(): Promise<Collection<ScheduledItemDoc>> {
  const db = await getDb();
  return db.collection<ScheduledItemDoc>("schedule");
}

export async function listScheduledItems(): Promise<ScheduledItem[]> {
  const collection = await scheduleCollection();
  const docs = await collection.find().sort({ scheduledDate: 1, createdAt: 1 }).toArray();
  return docs.map(toScheduledItem);
}

function utcDayStart(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

async function findTodaysScheduledDoc(rawUsername: string) {
  const account = await getAccountByUsername(rawUsername);
  if (!account) {
    throw new ScheduleError("Account not found.", 404);
  }

  const accountId = parseId(account.id);
  if (!accountId) {
    throw new ScheduleError("Account not found.", 404);
  }

  const scheduledDate = utcDayStart();
  const collection = await scheduleCollection();
  const doc = await collection.findOne(
    { accountId, scheduledDate },
    { sort: { createdAt: 1 } },
  );
  if (!doc) {
    throw new ScheduleError("No scheduled post for today.", 404);
  }

  return { account, collection, doc };
}

export async function getTodaysPublicPost(
  rawUsername: string,
): Promise<PublicScheduledPost> {
  const { account, doc } = await findTodaysScheduledDoc(rawUsername);
  const item = toScheduledItem(doc);
  return {
    username: account.username,
    date: item.scheduledDate.slice(0, 10),
    url: buildCdnUrl(item.video.path),
    posted: item.posted,
  };
}

export async function finalizeTodaysPublicPost(
  rawUsername: string,
): Promise<{ status: "okay" | "already posted" }> {
  const { collection, doc } = await findTodaysScheduledDoc(rawUsername);
  if (doc.posted === true) {
    return { status: "already posted" };
  }

  await collection.updateOne(
    { _id: doc._id },
    { $set: { posted: true, updatedAt: new Date() } },
  );
  return { status: "okay" };
}

export async function createScheduleUpload(
  sizeValue: unknown,
  contentTypeValue: unknown,
): Promise<ScheduleUploadPlan> {
  const size =
    typeof sizeValue === "number"
      ? sizeValue
      : typeof sizeValue === "string"
        ? Number(sizeValue)
        : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    throw new ScheduleError("Upload an MP4.", 400);
  }
  if (size > MP4_MAX_BYTES) {
    throw new ScheduleError("That video is too large.", 400);
  }
  if (!isAllowedVideoType(contentTypeValue)) {
    throw new ScheduleError("Upload an MP4.", 400);
  }

  await ensureR2BrowserUploadCors();
  const path = `${VIDEO_FOLDER}/${randomUUID()}.mp4`;
  if (size <= MULTIPART_PART_BYTES) {
    return {
      path,
      strategy: "put",
      uploadUrl: createPresignedR2PutUrl(path),
    };
  }

  const uploadId = await createMultipartUpload(path, "video/mp4");
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
        uploadUrl: createPresignedR2PutUrl(path, {
          partNumber: String(partNumber),
          uploadId,
        }),
      };
    }),
  };
}

export async function completeScheduleUpload(
  pathValue: unknown,
  uploadIdValue: unknown,
  partsValue: unknown,
): Promise<{ path: string }> {
  if (typeof pathValue !== "string" || !SCHEDULE_PATH_RE.test(pathValue)) {
    throw new ScheduleError("Upload an MP4.", 400);
  }
  const path = pathValue;
  if (typeof uploadIdValue !== "string" || !uploadIdValue) {
    throw new ScheduleError("Could not upload that video.", 400);
  }
  if (!Array.isArray(partsValue) || partsValue.length === 0) {
    throw new ScheduleError("Could not upload that video.", 400);
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
      throw new ScheduleError("Could not upload that video.", 400);
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

export async function abortScheduleUpload(
  pathValue: unknown,
  uploadIdValue: unknown,
): Promise<void> {
  if (typeof pathValue !== "string" || !SCHEDULE_PATH_RE.test(pathValue)) {
    throw new ScheduleError("Upload an MP4.", 400);
  }
  const path = pathValue;
  if (typeof uploadIdValue !== "string" || !uploadIdValue) {
    throw new ScheduleError("Could not upload that video.", 400);
  }
  await abortMultipartUpload(path, uploadIdValue);
}

export async function createScheduledItem(
  scheduledDateValue: unknown,
  accountIdValue: unknown,
  videoValue: unknown,
): Promise<ScheduledItem> {
  const { accountId, scheduledDate } = await parseScheduleFields(
    accountIdValue,
    scheduledDateValue,
  );
  const video = parseRequiredMediaRef(videoValue, SCHEDULE_PATH_RE);
  if (!video) {
    throw new ScheduleError("Upload an MP4.", 400);
  }
  if (!(await r2ObjectExists(video.path))) {
    throw new ScheduleError("Could not upload that video.", 400);
  }

  const now = new Date();
  try {
    const collection = await scheduleCollection();
    const result = await collection.insertOne({
      accountId,
      video,
      scheduledDate,
      posted: false,
      createdAt: now,
      updatedAt: now,
    });
    return {
      id: result.insertedId.toHexString(),
      accountId: accountId.toHexString(),
      video,
      scheduledDate: scheduledDate.toISOString(),
      posted: false,
    };
  } catch (error) {
    await deleteFileFromCloudflare(video.path).catch(() => undefined);
    throw error;
  }
}

export async function updateScheduledItem(
  rawId: string,
  accountIdValue: unknown,
  scheduledDateValue: unknown,
): Promise<ScheduledItem> {
  const id = parseId(rawId);
  if (!id) {
    throw new ScheduleError("Scheduled item not found.", 404);
  }
  const { accountId, scheduledDate } = await parseScheduleFields(
    accountIdValue,
    scheduledDateValue,
  );

  const collection = await scheduleCollection();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: { accountId, scheduledDate, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) {
    throw new ScheduleError("Scheduled item not found.", 404);
  }
  return toScheduledItem(result);
}

export async function deleteScheduledItem(rawId: string): Promise<void> {
  const id = parseId(rawId);
  if (!id) {
    throw new ScheduleError("Scheduled item not found.", 404);
  }

  const collection = await scheduleCollection();
  const doc = await collection.findOne({ _id: id });
  if (!doc) {
    throw new ScheduleError("Scheduled item not found.", 404);
  }

  await deleteFileFromCloudflare(doc.video.path);
  await collection.deleteOne({ _id: id });
}
