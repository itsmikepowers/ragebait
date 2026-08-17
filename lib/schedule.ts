import { randomUUID } from "crypto";
import { ObjectId, type Collection } from "mongodb";
import { getAccount } from "./accounts";
import {
  deleteFileFromCloudflare,
  uploadFileToCloudflare,
} from "./cloudflare";
import { getDb } from "./mongodb";

export type ScheduledItem = {
  id: string;
  accountId: string;
  path: string;
  scheduledDate: string;
  posted: boolean;
};

type ScheduledItemDoc = {
  accountId: ObjectId;
  path: string;
  scheduledDate: Date;
  posted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const VIDEO_FOLDER = "schedule";
const MP4_MAX_BYTES = 100 * 1024 * 1024;

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
    path: doc.path,
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

function isMp4(file: File): boolean {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".mp4")) {
    return false;
  }
  return (
    !file.type ||
    file.type === "video/mp4" ||
    file.type === "application/mp4" ||
    file.type === "application/octet-stream"
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

export async function createScheduledItem(
  file: File | null,
  scheduledDateValue: unknown,
  accountIdValue: unknown,
): Promise<ScheduledItem> {
  const { accountId, scheduledDate } = await parseScheduleFields(
    accountIdValue,
    scheduledDateValue,
  );
  if (!file) {
    throw new ScheduleError("Upload an MP4.", 400);
  }
  if (!isMp4(file)) {
    throw new ScheduleError("Upload an MP4.", 400);
  }
  if (file.size > MP4_MAX_BYTES) {
    throw new ScheduleError("That video is too large.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = `${randomUUID()}.mp4`;
  const { path } = await uploadFileToCloudflare(
    buffer,
    VIDEO_FOLDER,
    fileName,
    "video/mp4",
  );

  const now = new Date();
  try {
    const collection = await scheduleCollection();
    const result = await collection.insertOne({
      accountId,
      path,
      scheduledDate,
      posted: false,
      createdAt: now,
      updatedAt: now,
    });
    return {
      id: result.insertedId.toHexString(),
      accountId: accountId.toHexString(),
      path,
      scheduledDate: scheduledDate.toISOString(),
      posted: false,
    };
  } catch (error) {
    await deleteFileFromCloudflare(path).catch(() => undefined);
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

  await deleteFileFromCloudflare(doc.path);
  await collection.deleteOne({ _id: id });
}
