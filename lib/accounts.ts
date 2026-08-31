import { MongoServerError, ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

export type Account = {
  id: string;
  name: string;
  username: string;
};

type AccountDoc = {
  name: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
};

type AccountFields = {
  name?: unknown;
  username?: unknown;
};

const NAME_MAX = 80;
const USERNAME_MAX = 80;

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

function parseFields(fields: AccountFields): Omit<Account, "id"> {
  const name = normalizeName(fields.name);
  const username = normalizeUsername(fields.username);
  if (!name || !username) {
    throw new AccountError("Enter a name and username.", 400);
  }
  return { name, username };
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
  const account = parseFields(fields);
  const now = new Date();
  try {
    const collection = await accountsCollection();
    const result = await collection.insertOne({
      ...account,
      createdAt: now,
      updatedAt: now,
    });
    return { id: result.insertedId.toHexString(), ...account };
  } catch (error) {
    if (isDuplicateUsername(error)) {
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
  const account = parseFields(fields);

  try {
    const collection = await accountsCollection();
    const result = await collection.findOneAndUpdate(
      { _id: id },
      { $set: { ...account, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!result) {
      throw new AccountError("Account not found.", 404);
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
  const result = await collection.deleteOne({ _id: id });
  if (result.deletedCount === 0) {
    throw new AccountError("Account not found.", 404);
  }
}

export class AccountError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
