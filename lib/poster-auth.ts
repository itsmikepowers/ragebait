/**
 * Shared-secret guard for the machine-facing publishing endpoints.
 *
 * These routes are hit by the poster automation, not by a browser session, so
 * they authenticate with a bearer token from Doppler rather than the dashboard
 * password. Absent config fails CLOSED: without the secret set, no caller can
 * mutate the schedule.
 */
import { timingSafeEqual } from "crypto";

export function presentedToken(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return (request.headers.get("x-ragebait-key") || "").trim();
}

/** Constant-time compare that never throws on length mismatch. */
function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Returns null when the caller is authorized, or a Response to return as-is.
 */
export function requirePosterAuth(request: Request): Response | null {
  const expected = (process.env.POSTER_API_KEY || "").trim();
  if (!expected) {
    return Response.json(
      { error: "Publishing API is not configured." },
      { status: 503 },
    );
  }
  if (!matches(presentedToken(request), expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
