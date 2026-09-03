/**
 * Drop-in `fetch` for dashboard API calls, with the Firebase ID token attached.
 *
 * Returns a real Response, so it substitutes for `fetch` at every existing call
 * site without touching the `response.ok` / `await response.json()` handling
 * around it. That's the point: one helper instead of 30 hand-edited calls, and
 * a new page can't forget the header by writing plain `fetch`.
 *
 * Reads `currentAuthUser()` at call time rather than taking a user argument, so
 * it works outside React too.
 */
import { getClientAuth } from "@/lib/auth/firebase";

async function idToken(): Promise<string> {
  const user = getClientAuth().currentUser;
  if (!user) {
    return "";
  }
  try {
    return await user.getIdToken();
  } catch {
    return "";
  }
}

export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await idToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { cache: "no-store", ...init, headers });
}
