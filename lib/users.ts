/**
 * Users and admin grants.
 *
 * Two collections, mirroring hypefeed:
 *   `users`  — one row per Firebase account, created on first authenticated
 *              request (see `GET /api/user`). Identity of record is `uid`.
 *   `admins` — an allow-list keyed by lowercased email. Membership here is
 *              what grants access to the real dashboard tabs.
 *
 * Admin is deliberately email-keyed rather than a flag on the user row: you can
 * grant admin to someone who has never signed in, and the grant survives an
 * account being deleted and recreated.
 *
 * SUPER_ADMIN_EMAIL (comma-separated, from Doppler) is a hard-coded super-admin
 * list that no database write can revoke — that's the lockout guard. Super
 * admins are the only ones who may add or remove other admins.
 */
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

export type AppUser = {
  id: string;
  uid: string;
  email: string;
  name: string;
  photoUrl: string;
  createdAt: string;
  lastLoggedIn: string;
  /** Derived, never stored: email is in the `admins` collection. */
  isAdmin: boolean;
  /** Derived, never stored: email is in SUPER_ADMIN_EMAIL. */
  isSuperAdmin: boolean;
};

type UserDoc = {
  uid: string;
  email: string;
  name: string;
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoggedIn: Date;
};

type AdminDoc = {
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

const NAME_MAX = 120;
const EMAIL_MAX = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UserError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const email = value.trim().toLowerCase().slice(0, EMAIL_MAX);
  return EMAIL_RE.test(email) ? email : "";
}

/** Hard-coded super admins from Doppler; no DB write can remove these. */
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAIL || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string): boolean {
  return superAdminEmails().includes(email.trim().toLowerCase());
}

async function usersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb();
  return db.collection<UserDoc>("users");
}

async function adminsCollection(): Promise<Collection<AdminDoc>> {
  const db = await getDb();
  return db.collection<AdminDoc>("admins");
}

function toAppUser(
  doc: UserDoc & { _id: ObjectId },
  isAdmin: boolean,
  isSuperAdmin: boolean,
): AppUser {
  return {
    id: doc._id.toHexString(),
    uid: doc.uid,
    email: doc.email ?? "",
    name: doc.name ?? "",
    photoUrl: doc.photoUrl ?? "",
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : "",
    lastLoggedIn:
      doc.lastLoggedIn instanceof Date ? doc.lastLoggedIn.toISOString() : "",
    isAdmin,
    isSuperAdmin,
  };
}

/** True when this email has been granted admin (DB grant or super admin). */
export async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (isSuperAdminEmail(normalized)) {
    return true;
  }
  const admins = await adminsCollection();
  return (await admins.findOne({ email: normalized })) !== null;
}

/**
 * Finds the user row for a verified Firebase token, creating it on first sign
 * in. Also refreshes lastLoggedIn and backfills name/photo from the provider.
 */
export async function upsertUserFromToken(token: {
  uid: string;
  email: string;
  name: string;
  photoUrl: string;
}): Promise<AppUser> {
  const users = await usersCollection();
  const now = new Date();
  const email = token.email.trim().toLowerCase();
  const name = token.name.trim().slice(0, NAME_MAX);

  // A field may appear in $set OR $setOnInsert, never both — Mongo rejects the
  // whole update with ConflictingUpdateOperators. So when the provider gave us
  // a name we always set it; when it didn't, we only seed one on insert.
  const result = await users.findOneAndUpdate(
    { uid: token.uid },
    {
      $set: {
        email,
        lastLoggedIn: now,
        updatedAt: now,
        // Never blank a value the user may already have.
        ...(name ? { name } : {}),
        ...(token.photoUrl ? { photoUrl: token.photoUrl } : {}),
      },
      $setOnInsert: {
        uid: token.uid,
        createdAt: now,
        ...(name ? {} : { name: email.split("@")[0] }),
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!result) {
    throw new UserError("Could not load your account.", 500);
  }

  const [admin, superAdmin] = [
    await isAdminEmail(email),
    isSuperAdminEmail(email),
  ];
  return toAppUser(result, admin, superAdmin);
}

export async function listUsers(): Promise<AppUser[]> {
  const users = await usersCollection();
  const admins = await adminsCollection();
  const [docs, adminDocs] = await Promise.all([
    users.find().sort({ createdAt: -1 }).toArray(),
    admins.find().toArray(),
  ]);
  const granted = new Set(adminDocs.map((doc) => doc.email));
  const supers = new Set(superAdminEmails());
  return docs.map((doc) => {
    const email = (doc.email ?? "").toLowerCase();
    return toAppUser(doc, granted.has(email) || supers.has(email), supers.has(email));
  });
}

/**
 * Grants or revokes admin for a user id. Super admins are immutable — trying to
 * demote one is rejected rather than silently ignored, so the UI can say why.
 */
export async function setUserAdmin(
  rawId: string,
  isAdmin: boolean,
): Promise<AppUser> {
  if (!/^[a-fA-F0-9]{24}$/.test(rawId)) {
    throw new UserError("User not found.", 404);
  }
  const users = await usersCollection();
  const doc = await users.findOne({ _id: new ObjectId(rawId) });
  if (!doc) {
    throw new UserError("User not found.", 404);
  }

  const email = (doc.email ?? "").toLowerCase();
  if (isSuperAdminEmail(email)) {
    throw new UserError("That account is a permanent admin.", 400);
  }

  const admins = await adminsCollection();
  const now = new Date();
  if (isAdmin) {
    await admins.updateOne(
      { email },
      { $set: { email, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  } else {
    await admins.deleteOne({ email });
  }

  return toAppUser(doc, isAdmin, false);
}
