/**
 * TEMPORARY diagnostic — reports why auth is failing in production.
 *
 * Returns no secret values, only whether each key is present and parseable,
 * plus the real error text from importing and initializing firebase-admin.
 * Delete once the deploy is verified.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const report: Record<string, unknown> = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    env: process.env.VERCEL_ENV ?? "local",
    node: process.version,
    runtime: typeof EdgeRuntime === "undefined" ? "nodejs" : "edge",
  };

  for (const key of [
    "FIREBASE_ADMIN_CONFIG",
    "NEXT_PUBLIC_FIREBASE_CONFIG",
    "SUPER_ADMIN_EMAIL",
    "MONGODB_CONFIG",
  ]) {
    const raw = process.env[key];
    report[key] = !raw
      ? "MISSING"
      : (() => {
          try {
            const parsed = JSON.parse(raw);
            return `ok json, keys=${Object.keys(parsed).length}`;
          } catch {
            return `present, not json, len=${raw.length}`;
          }
        })();
  }

  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    report.import = "ok";
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(
          JSON.parse(process.env.FIREBASE_ADMIN_CONFIG || "{}") as Record<
            string,
            string
          >,
        ),
      });
    }
    report.init = "ok";
    const { getAuth } = await import("firebase-admin/auth");
    getAuth(getApps()[0]!);
    report.getAuth = "ok";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.stack =
      error instanceof Error ? error.stack?.split("\n").slice(0, 6) : null;
  }

  return Response.json(report);
}
