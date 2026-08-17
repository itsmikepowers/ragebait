import { MongoServerError, ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

export type Account = {
  id: string;
  name: string;
};

type AccountDoc = {
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

const NAME_MAX = 80;

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

function parseId(value: string): ObjectId | null {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) {
    return null;
  }
  return new ObjectId(value);
}

function toAccount(doc: AccountDoc & { _id: ObjectId }): Account {
  return { id: doc._id.toHexString(), name: doc.name };
}

let indexesReady = false;

async function accountsCollection(): Promise<Collection<AccountDoc>> {
  const db = await getDb();
  const collection = db.collection<AccountDoc>("accounts");
  if (!indexesReady) {
    await collection.createIndex({ name: 1 }, { unique: true });
    indexesReady = true;
  }
  return collection;
}

function isDuplicateName(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

export async function listAccounts(): Promise<Account[]> {
  const collection = await accountsCollection();
  const docs = await collection.find().sort({ createdAt: 1 }).toArray();
  return docs.map(toAccount);
}

export async function createAccount(rawName: unknown): Promise<Account> {
  const name = normalizeName(rawName);
  if (!name) {
    throw new AccountError("Enter an account name.", 400);
  }

  const now = new Date();
  try {
    const collection = await accountsCollection();
    const result = await collection.insertOne({
      name,
      createdAt: now,
      updatedAt: now,
    });
    return { id: result.insertedId.toHexString(), name };
  } catch (error) {
    if (isDuplicateName(error)) {
      throw new AccountError("That account already exists.", 409);
    }
    throw error;
  }
}

export async function updateAccount(
  rawId: string,
  rawName: unknown,
): Promise<Account> {
  const id = parseId(rawId);
  const name = normalizeName(rawName);
  if (!id) {
    throw new AccountError("Account not found.", 404);
  }
  if (!name) {
    throw new AccountError("Enter an account name.", 400);
  }

  try {
    const collection = await accountsCollection();
    const result = await collection.findOneAndUpdate(
      { _id: id },
      { $set: { name, updatedAt: new Date() } },
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
    if (isDuplicateName(error)) {
      throw new AccountError("That account already exists.", 409);
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
