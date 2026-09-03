/**
 * Clip requests — the user-submitted queue.
 *
 * A request is "someone pasted a YouTube URL and wants clips out of it". It is
 * deliberately a SEPARATE collection from `clipping`, not another `kind` on it:
 * a request is a job with a lifecycle (queued -> processing -> done/failed),
 * while a clipping row is a stored artifact. Overloading the existing kind
 * discriminator with a third value would have put job state on every media row
 * and made every existing query lie about what it returns.
 *
 * The link runs one way: when a job finishes, the worker stamps `sourceId` with
 * the clipping row it produced, so the user's finished clips are found via that
 * source's children.
 *
 * OWNERSHIP is the point of this whole module. Every request carries the
 * submitter's `userId`, and every read path takes an owner argument — a user
 * can only ever see their own rows, admins see all. There is no query in here
 * that returns everything without the caller explicitly asking as an admin.
 */
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

// Status constants live in the client-safe twin so the UI and the server share
// one list; re-exported here so existing server importers keep working.
export {
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
} from "./clip-requests-meta";
export type { RequestStatus } from "./clip-requests-meta";

import { REQUEST_STATUSES, type RequestStatus } from "./clip-requests-meta";

export type ClipRequest = {
  id: string;
  userId: string;
  /** Denormalized so the admin list doesn't need a join per row. */
  userEmail: string;
  youtubeUrl: string;
  /** Video title, filled in by the worker once it probes the URL. */
  title: string;
  note: string;
  status: RequestStatus;
  /** The clipping source row this produced, "" until done. */
  sourceId: string;
  /** How many clips came out of it. */
  clipCount: number;
  /** Operator-facing failure reason; shown to the submitter too. */
  error: string;
  createdAt: string;
  /** When a worker claimed it. */
  startedAt: string;
  completedAt: string;
};

type ClipRequestDoc = {
  userId: ObjectId;
  userEmail: string;
  youtubeUrl: string;
  title?: string;
  note?: string;
  status: RequestStatus;
  sourceId?: string;
  clipCount?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

const NOTE_MAX = 2000;
const TITLE_MAX = 300;
const ERROR_MAX = 1000;
const URL_MAX = 600;
/** Stops one account filling the queue; admins are exempt. */
const MAX_OPEN_PER_USER = 10;

export class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Accepts the YouTube URL shapes people actually paste — watch, youtu.be,
 * shorts, live — and normalizes to a canonical watch URL so the same video
 * submitted two ways is recognizably the same job.
 *
 * Returns null for anything that isn't YouTube. We only support YouTube for
 * now, and silently accepting a Vimeo link would fail confusingly later in the
 * worker instead of immediately at submit time.
 */
export function normalizeYouTubeUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().slice(0, URL_MAX);
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";

  if (host === "youtu.be") {
    id = parsed.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (parsed.pathname === "/watch") {
      id = parsed.searchParams.get("v") || "";
    } else {
      const match = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(parsed.pathname);
      id = match?.[1] || "";
    }
  } else {
    return null;
  }

  // YouTube ids are 11 chars of [A-Za-z0-9_-].
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return null;
  }
  return `https://www.youtube.com/watch?v=${id}`;
}

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

function parseId(value: string): ObjectId | null {
  return /^[a-fA-F0-9]{24}$/.test(value) ? new ObjectId(value) : null;
}

function toClipRequest(doc: ClipRequestDoc & { _id: ObjectId }): ClipRequest {
  const iso = (d: Date | null | undefined) =>
    d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
  return {
    id: doc._id.toHexString(),
    userId: doc.userId?.toHexString?.() ?? "",
    userEmail: doc.userEmail ?? "",
    youtubeUrl: doc.youtubeUrl ?? "",
    title: doc.title ?? "",
    note: doc.note ?? "",
    status: REQUEST_STATUSES.includes(doc.status) ? doc.status : "queued",
    sourceId: doc.sourceId ?? "",
    clipCount: typeof doc.clipCount === "number" ? doc.clipCount : 0,
    error: doc.error ?? "",
    createdAt: iso(doc.createdAt),
    startedAt: iso(doc.startedAt),
    completedAt: iso(doc.completedAt),
  };
}

async function requestsCollection(): Promise<Collection<ClipRequestDoc>> {
  const db = await getDb();
  return db.collection<ClipRequestDoc>("clipRequests");
}

export async function createClipRequest(
  user: { id: string; email: string; isAdmin: boolean },
  urlValue: unknown,
  noteValue: unknown,
): Promise<ClipRequest> {
  const youtubeUrl = normalizeYouTubeUrl(urlValue);
  if (!youtubeUrl) {
    throw new RequestError("Paste a YouTube link.", 400);
  }
  const userId = parseId(user.id);
  if (!userId) {
    throw new RequestError("Could not identify your account.", 400);
  }

  const collection = await requestsCollection();

  // Same video, still in flight, same user -> return the existing job rather
  // than queueing a duplicate. Double-submitting is a normal accident.
  const existing = await collection.findOne({
    userId,
    youtubeUrl,
    status: { $in: ["queued", "processing"] },
  });
  if (existing) {
    return toClipRequest(existing);
  }

  if (!user.isAdmin) {
    const open = await collection.countDocuments({
      userId,
      status: { $in: ["queued", "processing"] },
    });
    if (open >= MAX_OPEN_PER_USER) {
      throw new RequestError(
        "You already have the maximum number of videos in the queue.",
        429,
      );
    }
  }

  const now = new Date();
  const doc: ClipRequestDoc = {
    userId,
    userEmail: user.email,
    youtubeUrl,
    title: "",
    note: normalizeText(noteValue, NOTE_MAX),
    status: "queued",
    sourceId: "",
    clipCount: 0,
    error: "",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
  const result = await collection.insertOne(doc);
  return toClipRequest({ ...doc, _id: result.insertedId });
}

/**
 * Lists requests. `ownerId` null means "every user" and is ONLY ever passed by
 * an admin-guarded route — the scoping decision lives at the call site so it
 * can't be defaulted away here.
 */
export async function listClipRequests(
  ownerId: string | null,
): Promise<ClipRequest[]> {
  const collection = await requestsCollection();
  const filter: Record<string, unknown> = {};
  if (ownerId !== null) {
    const userId = parseId(ownerId);
    if (!userId) {
      return [];
    }
    filter.userId = userId;
  }
  const docs = await collection.find(filter).sort({ createdAt: -1 }).toArray();
  return docs.map(toClipRequest);
}

export async function getClipRequest(
  rawId: string,
  ownerId: string | null,
): Promise<ClipRequest | null> {
  const id = parseId(rawId);
  if (!id) {
    return null;
  }
  const collection = await requestsCollection();
  const filter: Record<string, unknown> = { _id: id };
  if (ownerId !== null) {
    const userId = parseId(ownerId);
    if (!userId) {
      return null;
    }
    filter.userId = userId;
  }
  const doc = await collection.findOne(filter);
  return doc ? toClipRequest(doc) : null;
}

/**
 * Deletes a request. A user may only delete their OWN, and only while it is
 * still queued — pulling a job out from under a running worker would leave the
 * worker uploading against a row that no longer exists.
 */
export async function deleteClipRequest(
  rawId: string,
  ownerId: string | null,
): Promise<void> {
  const id = parseId(rawId);
  if (!id) {
    throw new RequestError("Request not found.", 404);
  }
  const collection = await requestsCollection();
  const filter: Record<string, unknown> = { _id: id };
  if (ownerId !== null) {
    const userId = parseId(ownerId);
    if (!userId) {
      throw new RequestError("Request not found.", 404);
    }
    filter.userId = userId;
  }
  const doc = await collection.findOne(filter);
  if (!doc) {
    throw new RequestError("Request not found.", 404);
  }
  if (doc.status === "processing" && ownerId !== null) {
    throw new RequestError("That video is already being worked on.", 400);
  }
  await collection.deleteOne({ _id: id });
}

/* -------------------------------------------------------------------------
 * Worker side. These are called by the machine that actually renders, which
 * authenticates with the poster key rather than a user session.
 * ---------------------------------------------------------------------- */

/**
 * Atomically claims the oldest queued job.
 *
 * findOneAndUpdate is what makes this safe: the read and the status flip are a
 * single operation, so two workers polling at the same moment can never claim
 * the same job. Returns null when the queue is empty.
 */
export async function claimNextRequest(): Promise<ClipRequest | null> {
  const collection = await requestsCollection();
  const now = new Date();
  const doc = await collection.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "processing", startedAt: now, updatedAt: now } },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
  return doc ? toClipRequest(doc) : null;
}

/** Puts a claimed job back on the queue (worker crashed, or you changed your mind). */
export async function releaseRequest(rawId: string): Promise<ClipRequest> {
  const id = parseId(rawId);
  if (!id) {
    throw new RequestError("Request not found.", 404);
  }
  const collection = await requestsCollection();
  const doc = await collection.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        status: "queued",
        startedAt: null,
        error: "",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!doc) {
    throw new RequestError("Request not found.", 404);
  }
  return toClipRequest(doc);
}

export type RequestUpdate = {
  status?: unknown;
  title?: unknown;
  sourceId?: unknown;
  clipCount?: unknown;
  error?: unknown;
};

/** Worker progress/completion update. */
export async function updateClipRequest(
  rawId: string,
  fields: RequestUpdate,
): Promise<ClipRequest> {
  const id = parseId(rawId);
  if (!id) {
    throw new RequestError("Request not found.", 404);
  }

  const update: Partial<ClipRequestDoc> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (fields.status !== undefined) {
    const status = fields.status;
    if (
      typeof status !== "string" ||
      !REQUEST_STATUSES.includes(status as RequestStatus)
    ) {
      throw new RequestError("Unknown status.", 400);
    }
    update.status = status as RequestStatus;
    // Reaching a terminal state stamps the finish time; going back to an
    // active state clears it, so a retried job doesn't claim it finished.
    if (status === "done" || status === "failed") {
      update.completedAt = new Date();
    } else {
      update.completedAt = null;
    }
    if (status !== "failed") {
      update.error = "";
    }
  }
  if (fields.title !== undefined) {
    update.title = normalizeText(fields.title, TITLE_MAX);
  }
  if (fields.sourceId !== undefined) {
    const raw = fields.sourceId;
    update.sourceId =
      typeof raw === "string" && /^[a-fA-F0-9]{24}$/.test(raw) ? raw : "";
  }
  if (fields.clipCount !== undefined) {
    const n = Number(fields.clipCount);
    update.clipCount = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  if (fields.error !== undefined) {
    update.error = normalizeText(fields.error, ERROR_MAX);
  }

  const collection = await requestsCollection();
  const doc = await collection.findOneAndUpdate(
    { _id: id },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!doc) {
    throw new RequestError("Request not found.", 404);
  }
  return toClipRequest(doc);
}
