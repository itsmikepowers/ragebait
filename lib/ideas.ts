import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

export type Idea = {
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

type IdeaDoc = {
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
  createdAt: Date;
  updatedAt: Date;
};

const TEXT_MAX = 2200;

export class IdeaError extends Error {
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

function normalizeText(value: unknown, max = TEXT_MAX): string {
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
    return trimmed.slice(0, 600);
  } catch {
    return "";
  }
}

function normalizeCount(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.floor(num);
}

function toIdea(doc: IdeaDoc & { _id: ObjectId }): Idea {
  return {
    id: doc._id.toHexString(),
    sourceUsername: doc.sourceUsername ?? "",
    sourceUrl: doc.sourceUrl ?? "",
    mediaUrl: doc.mediaUrl ?? "",
    thumbnailUrl: doc.thumbnailUrl ?? "",
    isVideo: doc.isVideo === true,
    shirtText: doc.shirtText ?? "",
    note: doc.note ?? "",
    captionIdea: doc.captionIdea ?? "",
    likes: doc.likes ?? 0,
    comments: doc.comments ?? 0,
    used: doc.used === true,
  };
}

async function ideasCollection(): Promise<Collection<IdeaDoc>> {
  const db = await getDb();
  return db.collection<IdeaDoc>("ideas");
}

export async function listIdeas(): Promise<Idea[]> {
  const collection = await ideasCollection();
  const docs = await collection
    .find()
    .sort({ used: 1, likes: -1, createdAt: -1 })
    .toArray();
  return docs.map(toIdea);
}

type IdeaFields = {
  sourceUsername?: unknown;
  sourceUrl?: unknown;
  mediaUrl?: unknown;
  thumbnailUrl?: unknown;
  isVideo?: unknown;
  shirtText?: unknown;
  note?: unknown;
  captionIdea?: unknown;
  likes?: unknown;
  comments?: unknown;
  used?: unknown;
};

export async function createIdea(fields: IdeaFields): Promise<Idea> {
  const sourceUrl = normalizeHttpUrl(fields.sourceUrl);
  const thumbnailUrl = normalizeHttpUrl(fields.thumbnailUrl);
  if (!sourceUrl && !thumbnailUrl) {
    throw new IdeaError("Add a source or thumbnail URL.", 400);
  }

  const now = new Date();
  const doc: IdeaDoc = {
    sourceUsername: normalizeText(fields.sourceUsername, 80),
    sourceUrl,
    mediaUrl: normalizeHttpUrl(fields.mediaUrl),
    thumbnailUrl,
    isVideo: fields.isVideo === true,
    shirtText: normalizeText(fields.shirtText, 400),
    note: normalizeText(fields.note),
    captionIdea: normalizeText(fields.captionIdea, 400),
    likes: normalizeCount(fields.likes),
    comments: normalizeCount(fields.comments),
    used: fields.used === true,
    createdAt: now,
    updatedAt: now,
  };

  const collection = await ideasCollection();
  // Same post scraped twice shouldn't create a duplicate row.
  if (doc.sourceUrl) {
    const existing = await collection.findOne({ sourceUrl: doc.sourceUrl });
    if (existing) {
      const updated = await collection.findOneAndUpdate(
        { _id: existing._id },
        { $set: { ...doc, createdAt: existing.createdAt, updatedAt: now } },
        { returnDocument: "after" },
      );
      if (updated) {
        return toIdea(updated);
      }
    }
  }

  const result = await collection.insertOne(doc);
  return toIdea({ ...doc, _id: result.insertedId });
}

export async function updateIdea(
  rawId: string,
  fields: IdeaFields,
): Promise<Idea> {
  const id = parseId(rawId);
  if (!id) {
    throw new IdeaError("Idea not found.", 404);
  }

  const update: Partial<IdeaDoc> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (fields.shirtText !== undefined) {
    update.shirtText = normalizeText(fields.shirtText, 400);
  }
  if (fields.note !== undefined) {
    update.note = normalizeText(fields.note);
  }
  if (fields.captionIdea !== undefined) {
    update.captionIdea = normalizeText(fields.captionIdea, 400);
  }
  if (fields.used !== undefined) {
    update.used = fields.used === true;
  }

  const collection = await ideasCollection();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!result) {
    throw new IdeaError("Idea not found.", 404);
  }
  return toIdea(result);
}

export async function deleteIdea(rawId: string): Promise<void> {
  const id = parseId(rawId);
  if (!id) {
    throw new IdeaError("Idea not found.", 404);
  }
  const collection = await ideasCollection();
  const result = await collection.deleteOne({ _id: id });
  if (result.deletedCount === 0) {
    throw new IdeaError("Idea not found.", 404);
  }
}
