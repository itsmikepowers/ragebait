import { MongoServerError, ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

export type Account = {
  id: string;
  name: string;
  username: string;
  phone: string;
};

type AccountDoc = {
  name: string;
  username: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
};

type AccountFields = {
  name?: unknown;
  username?: unknown;
  phone?: unknown;
};

const NAME_MAX = 80;
const USERNAME_MAX = 80;
const PHONE_MAX = 40;

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

function normalizePhone(value: unknown): string | null {
  if (value == null) {
    return "";
  }
  if (typeof value !== "string") {
    return null;
  }
  const phone = value.trim();
  if (!phone) {
    return "";
  }
  if (phone.length > PHONE_MAX) {
    return null;
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) {
    return null;
  }
  return phone;
}

function parseFields(fields: AccountFields): Omit<Account, "id"> {
  const name = normalizeName(fields.name);
  const username = normalizeUsername(fields.username);
  const phone = normalizePhone(fields.phone);
  if (!name || !username) {
    throw new AccountError("Enter a name and username.", 400);
  }
  if (phone === null) {
    throw new AccountError("Enter a valid phone number, or leave it blank.", 400);
  }
  return { name, username, phone };
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
    phone: doc.phone ?? "",
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
