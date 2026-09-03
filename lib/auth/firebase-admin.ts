/**
 * Firebase Admin SDK: verifies the ID token every dashboard request carries.
 *
 * Mirrors hypefeed's `src/lib/auth/firebase-admin.ts`. The whole service
 * account is one FIREBASE_ADMIN_CONFIG JSON blob from Doppler, and a missing
 * config throws rather than degrading to "allow" — this fails CLOSED, same as
 * `requirePosterAuth`.
 */
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  isAdminEmail,
  isSuperAdminEmail,
  upsertUserFromToken,
  UserError,
  type AppUser,
} from "@/lib/users";

export function getAdminAuth(): Auth {
  if (getApps().length === 0) {
    const config = process.env.FIREBASE_ADMIN_CONFIG;
    if (!config) {
      throw new UserError("Authentication is not configured.", 503);
    }
    initializeApp({
      credential: cert(JSON.parse(config) as Record<string, string>),
    });
  }
  return getAuth(getApps()[0]!);
}

export type TokenUser = {
  uid: string;
  email: string;
  name: string;
  photoUrl: string;
};

/**
 * Verifies `Authorization: Bearer <idToken>` and returns the token's identity.
 * Every failure path collapses to one 401 so we never leak which part failed.
 */
export async function extractUserFromToken(
  authHeader: string | null,
): Promise<TokenUser> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UserError("Sign in to continue.", 401);
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7).trim());
  } catch (error) {
    // A missing service account is a server misconfiguration, not a bad token.
    if (error instanceof UserError) {
      throw error;
    }
    throw new UserError("Sign in to continue.", 401);
  }

  const email = (decoded.email || "").toLowerCase();
  if (!email) {
    throw new UserError("That account has no email address.", 401);
  }

  return {
    uid: decoded.uid,
    email,
    name: decoded.name || email.split("@")[0] || "",
    photoUrl: typeof decoded.picture === "string" ? decoded.picture : "",
  };
}

/** Verified token -> the Mongo user row, created on first sign in. */
export async function getAuthenticatedUser(
  authHeader: string | null,
): Promise<AppUser> {
  return upsertUserFromToken(await extractUserFromToken(authHeader));
}

/** Any signed-in user may read this; admin-only data must use requireAdmin. */
export async function requireUser(authHeader: string | null): Promise<AppUser> {
  return getAuthenticatedUser(authHeader);
}

export async function requireAdmin(
  authHeader: string | null,
): Promise<AppUser> {
  const user = await getAuthenticatedUser(authHeader);
  if (!(await isAdminEmail(user.email))) {
    throw new UserError("You don't have access to that.", 403);
  }
  return user;
}

export async function requireSuperAdmin(
  authHeader: string | null,
): Promise<AppUser> {
  const user = await getAuthenticatedUser(authHeader);
  if (!isSuperAdminEmail(user.email)) {
    throw new UserError("You don't have access to that.", 403);
  }
  return user;
}
