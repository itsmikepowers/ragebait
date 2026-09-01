import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

/**
 * Ideas are research for the meme/funny t-shirt business: reference posts
 * worth reworking ("content") and source accounts worth mining ("accounts").
 * Both live in the same collection, split by `kind`.
 */
export type IdeaKind = "content" | "account";

/**
 * Product line the idea belongs to. Ideas are grouped by vertical first, then
 * by format, so unrelated businesses don't get mixed into one feed.
 */
export const IDEA_VERTICALS = ["funny-tshirts", "novelty-swimwear"] as const;
export type IdeaVertical = (typeof IDEA_VERTICALS)[number];

export const VERTICAL_LABELS: Record<IdeaVertical, string> = {
  "funny-tshirts": "Funny t-shirts",
  "novelty-swimwear": "Novelty swimwear",
};

/** Broad content lane, so ideas can be grouped by the joke format they use. */
export const IDEA_CATEGORIES = [
  "band-logo-parody",
  "name-acrostic",
  "relationship",
  "pick-one",
  "wholesome-illustrated",
  "corporate-parody",
  "absurd-oneliner",
  "reaction-prank",
  "product-reveal",
  "other",
] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

/** How safe the reference is to imitate on a brand account. */
export const IDEA_RISK_LEVELS = ["safe", "edgy", "avoid"] as const;
export type IdeaRisk = (typeof IDEA_RISK_LEVELS)[number];

export type Idea = {
  id: string;
  kind: IdeaKind;
  vertical: IdeaVertical;
  title: string;
  sourceUsername: string;
  sourceUrl: string;
  mediaUrl: string;
  thumbnailUrl: string;
  isVideo: boolean;
  category: IdeaCategory;
  risk: IdeaRisk;
  note: string;
  captionIdea: string;
  likes: number;
  comments: number;
  followers: number;
  postCount: number;
  used: boolean;
};

type IdeaDoc = Omit<Idea, "id"> & {
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

function normalizeKind(value: unknown): IdeaKind {
  return value === "account" ? "account" : "content";
}

function normalizeVertical(value: unknown): IdeaVertical {
  return IDEA_VERTICALS.includes(value as IdeaVertical)
    ? (value as IdeaVertical)
    : "funny-tshirts";
}

function normalizeCategory(value: unknown): IdeaCategory {
  return IDEA_CATEGORIES.includes(value as IdeaCategory)
    ? (value as IdeaCategory)
    : "other";
}

function normalizeRisk(value: unknown): IdeaRisk {
  return IDEA_RISK_LEVELS.includes(value as IdeaRisk)
    ? (value as IdeaRisk)
    : "safe";
}

function toIdea(doc: IdeaDoc & { _id: ObjectId }): Idea {
  return {
    id: doc._id.toHexString(),
    kind: normalizeKind(doc.kind),
    vertical: normalizeVertical(doc.vertical),
    title: doc.title ?? "",
    sourceUsername: doc.sourceUsername ?? "",
    sourceUrl: doc.sourceUrl ?? "",
    mediaUrl: doc.mediaUrl ?? "",
    thumbnailUrl: doc.thumbnailUrl ?? "",
    isVideo: doc.isVideo === true,
    category: normalizeCategory(doc.category),
    risk: normalizeRisk(doc.risk),
    note: doc.note ?? "",
    captionIdea: doc.captionIdea ?? "",
    likes: doc.likes ?? 0,
    comments: doc.comments ?? 0,
    followers: doc.followers ?? 0,
    postCount: doc.postCount ?? 0,
    used: doc.used === true,
  };
}

async function ideasCollection(): Promise<Collection<IdeaDoc>> {
  const db = await getDb();
  return db.collection<IdeaDoc>("ideas");
}

export async function listIdeas(
  kind?: IdeaKind,
  vertical?: IdeaVertical,
): Promise<Idea[]> {
  const collection = await ideasCollection();
  const filter: Record<string, unknown> = {};
  if (kind) {
    filter.kind = kind;
  }
  if (vertical) {
    // Legacy rows predate `vertical` and are all funny-tshirts.
    filter.vertical =
      vertical === "funny-tshirts"
        ? { $in: ["funny-tshirts", null] }
        : vertical;
  }
  const docs = await collection
    .find(filter)
    .sort({ used: 1, likes: -1, followers: -1, createdAt: -1 })
    .toArray();
  return docs.map(toIdea);
}

type IdeaFields = Partial<Record<keyof Idea, unknown>>;

export async function createIdea(fields: IdeaFields): Promise<Idea> {
  const sourceUrl = normalizeHttpUrl(fields.sourceUrl);
  const thumbnailUrl = normalizeHttpUrl(fields.thumbnailUrl);
  const title = normalizeText(fields.title, 400);
  if (!sourceUrl && !thumbnailUrl && !title) {
    throw new IdeaError("Add a title or source URL.", 400);
  }

  const now = new Date();
  const doc: IdeaDoc = {
    kind: normalizeKind(fields.kind),
    vertical: normalizeVertical(fields.vertical),
    title,
    sourceUsername: normalizeText(fields.sourceUsername, 80),
    sourceUrl,
    mediaUrl: normalizeHttpUrl(fields.mediaUrl),
    thumbnailUrl,
    isVideo: fields.isVideo === true,
    category: normalizeCategory(fields.category),
    risk: normalizeRisk(fields.risk),
    note: normalizeText(fields.note),
    captionIdea: normalizeText(fields.captionIdea, 400),
    likes: normalizeCount(fields.likes),
    comments: normalizeCount(fields.comments),
    followers: normalizeCount(fields.followers),
    postCount: normalizeCount(fields.postCount),
    used: fields.used === true,
    createdAt: now,
    updatedAt: now,
  };

  const collection = await ideasCollection();
  // Re-scraping the same post/account refreshes it instead of duplicating.
  if (doc.sourceUrl) {
    const existing = await collection.findOne({ sourceUrl: doc.sourceUrl });
    if (existing) {
      const updated = await collection.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            ...doc,
            used: existing.used === true,
            createdAt: existing.createdAt,
            updatedAt: now,
          },
        },
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
  if (fields.title !== undefined) {
    update.title = normalizeText(fields.title, 400);
  }
  if (fields.note !== undefined) {
    update.note = normalizeText(fields.note);
  }
  if (fields.captionIdea !== undefined) {
    update.captionIdea = normalizeText(fields.captionIdea, 400);
  }
  if (fields.category !== undefined) {
    update.category = normalizeCategory(fields.category);
  }
  if (fields.risk !== undefined) {
    update.risk = normalizeRisk(fields.risk);
  }
  if (fields.vertical !== undefined) {
    update.vertical = normalizeVertical(fields.vertical);
  }
  if (fields.thumbnailUrl !== undefined) {
    update.thumbnailUrl = normalizeHttpUrl(fields.thumbnailUrl);
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
