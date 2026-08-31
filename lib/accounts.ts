import { MongoServerError, ObjectId, type Collection } from "mongodb";
import {
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
} from "./media";

export type AccountLogo = MediaRef;

export type Account = {
  id: string;
  name: string;
  username: string;
  logo: AccountLogo | null;
};

type AccountDoc = {
  name: string;
  username: string;
  logo?: AccountLogo | null;
  createdAt: Date;
  updatedAt: Date;
};

type AccountFields = {
  name?: unknown;
  username?: unknown;
  logo?: unknown;
};

const NAME_MAX = 80;
const USERNAME_MAX = 80;

const LOGO_FOLDER = "logos";
const LOGO_MAX_BYTES = 8 * 1024 * 1024;
const LOGO_PATH_RE =
  /^logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim();
  if (!name || name.length > NAME_MAX) {
    return null;
  }
  return name;
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const username = value.trim().replace(/^@+/, "");
  if (!username || username.length > USERNAME_MAX) {
    return null;
  }
  return username;
}

function parseFields(fields: AccountFields): {
  name: string;
  username: string;
  logo: AccountLogo | null;
} {
  const name = normalizeName(fields.name);
  const username = normalizeUsername(fields.username);
  if (!name || !username) {
    throw new AccountError("Enter a name and username.", 400);
  }
  const logo = parseOptionalMediaRef(fields.logo, LOGO_PATH_RE);
  if (logo === undefined) {
    throw new AccountError("Could not save that logo.", 400);
  }
  return { name, username, logo };
}

function parseId(value: string): ObjectId | null {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) {
    return null;
  }
  return new ObjectId(value);
}

function toAccount(doc: AccountDoc & { _id: ObjectId }): Account {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    username: doc.username ?? "",
    logo: doc.logo ?? null,
  };
}

let indexesReady = false;

async function accountsCollection(): Promise<Collection<AccountDoc>> {
  const db = await getDb();
  const collection = db.collection<AccountDoc>("accounts");
  if (!indexesReady) {
    await collection.dropIndex("name_1").catch(() => undefined);
    await collection.createIndex({ username: 1 }, { unique: true });
    indexesReady = true;
  }
  return collection;
}

function isDuplicateUsername(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

export async function listAccounts(): Promise<Account[]> {
  const collection = await accountsCollection();
  const docs = await collection.find().sort({ createdAt: 1 }).toArray();
  return docs.map(toAccount);
}

export async function countAccounts(): Promise<number> {
  const collection = await accountsCollection();
  return collection.countDocuments();
}

export async function getAccount(rawId: string): Promise<Account | null> {
  const id = parseId(rawId);
  if (!id) {
    return null;
  }
  const collection = await accountsCollection();
  const doc = await collection.findOne({ _id: id });
  return doc ? toAccount(doc) : null;
}

export async function getAccountByUsername(
  rawUsername: string,
): Promise<Account | null> {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return null;
  }
  const collection = await accountsCollection();
  const doc = await collection.findOne({ username });
  return doc ? toAccount(doc) : null;
}

export async function createAccount(fields: AccountFields): Promise<Account> {
  const { name, username, logo } = parseFields(fields);
  if (logo && !(await r2ObjectExists(logo.path))) {
    throw new AccountError("Could not save that logo.", 400);
  }

  const now = new Date();
  try {
    const collection = await accountsCollection();
    const result = await collection.insertOne({
      name,
      username,
      logo,
      createdAt: now,
      updatedAt: now,
    });
    return { id: result.insertedId.toHexString(), name, username, logo };
  } catch (error) {
    if (isDuplicateUsername(error)) {
      if (logo) {
        await deleteFileFromCloudflare(logo.path).catch(() => undefined);
      }
      throw new AccountError("That username already exists.", 409);
    }
    throw error;
  }
}

export async function updateAccount(
  rawId: string,
  fields: AccountFields,
): Promise<Account> {
  const id = parseId(rawId);
  if (!id) {
    throw new AccountError("Account not found.", 404);
  }
  const { name, username, logo } = parseFields(fields);
  if (logo && !(await r2ObjectExists(logo.path))) {
    throw new AccountError("Could not save that logo.", 400);
  }

  try {
    const collection = await accountsCollection();
    const previous = await collection.findOne({ _id: id });
    if (!previous) {
      throw new AccountError("Account not found.", 404);
    }
    const result = await collection.findOneAndUpdate(
      { _id: id },
      { $set: { name, username, logo, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!result) {
      throw new AccountError("Account not found.", 404);
    }
    if (previous.logo?.path && previous.logo.path !== logo?.path) {
      await deleteFileFromCloudflare(previous.logo.path).catch(() => undefined);
    }
    return toAccount(result);
  } catch (error) {
    if (error instanceof AccountError) {
      throw error;
    }
    if (isDuplicateUsername(error)) {
      throw new AccountError("That username already exists.", 409);
    }
    throw error;
  }
}

export async function deleteAccount(rawId: string): Promise<void> {
  const id = parseId(rawId);
  if (!id) {
    throw new AccountError("Account not found.", 404);
  }

  const db = await getDb();
  const scheduledCount = await db
    .collection("schedule")
    .countDocuments({ accountId: id });
  if (scheduledCount > 0) {
    throw new AccountError(
      "Remove this account's scheduled items first.",
      409,
    );
  }

  const collection = await accountsCollection();
  const doc = await collection.findOne({ _id: id });
  const result = await collection.deleteOne({ _id: id });
  if (result.deletedCount === 0) {
    throw new AccountError("Account not found.", 404);
  }
  if (doc?.logo?.path) {
    await deleteFileFromCloudflare(doc.logo.path).catch(() => undefined);
  }
}

export type AccountLogoUploadPlan = ImageUploadPlan;

export async function createAccountLogoUpload(
  sizeValue: unknown,
  contentTypeValue: unknown,
): Promise<AccountLogoUploadPlan> {
  try {
    return await createImageUploadPlan(
      LOGO_FOLDER,
      sizeValue,
      contentTypeValue,
      LOGO_MAX_BYTES,
      {
        ensureCors: ensureR2BrowserUploadCors,
        presignPut: (path) => createPresignedR2PutUrl(path),
      },
    );
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      throw new AccountError(error.message, (error as { status: number }).status);
    }
    throw error;
  }
}

export class AccountError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
