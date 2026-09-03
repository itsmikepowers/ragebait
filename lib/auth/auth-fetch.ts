/**
 * Client-side helper for calling the dashboard API as the signed-in user.
 *
 * Every authenticated request carries a fresh Firebase ID token in the
 * Authorization header; the server verifies it with the Admin SDK. Mirrors
 * hypefeed's `src/lib/auth/auth-fetch.ts`.
 */
import type { User as FirebaseUser } from "firebase/auth";

export async function authFetch<T = unknown>(
  firebaseUser: FirebaseUser,
  url: string,
  options?: RequestInit,
): Promise<T> {
  const idToken = await firebaseUser.getIdToken();
  const isFormData = options?.body instanceof FormData;

  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const error = (await response.json()) as {
        error?: string;
        message?: string;
      };
      message = error.error || error.message || message;
    } catch {
      // Response body wasn't JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
