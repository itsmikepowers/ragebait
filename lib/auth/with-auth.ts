/**
 * Route wrappers that put an auth check in front of every handler.
 *
 * Mirrors hypefeed's `src/lib/auth/with-auth.ts`. The point of these is that
 * protecting a route is one word at the export site — `export const GET =
 * withAdmin(...)` — so a new route can't quietly ship unguarded the way all 22
 * of the pre-Firebase routes did.
 */
import { UserError, type AppUser } from "@/lib/users";
import {
  requireAdmin,
  requireSuperAdmin,
  requireUser,
} from "@/lib/auth/firebase-admin";

export type AuthedContext<P = Record<string, string>> = {
  user: AppUser;
  params: P;
};

type Handler<P> = (
  request: Request,
  ctx: AuthedContext<P>,
) => Promise<Response> | Response;

type RouteCtx<P> = { params: Promise<P> | P };

/** Turns thrown errors into JSON, preserving UserError's status. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UserError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return Response.json(
      { error: error.message },
      { status: (error as { status: number }).status },
    );
  }
  console.error(error);
  return Response.json(
    { error: "Could not reach the database." },
    { status: 500 },
  );
}

async function readParams<P>(routeCtx: RouteCtx<P> | undefined): Promise<P> {
  if (!routeCtx?.params) {
    return {} as P;
  }
  return await routeCtx.params;
}

function guarded<P>(
  check: (authHeader: string | null) => Promise<AppUser>,
  handler: Handler<P>,
) {
  return async (request: Request, routeCtx?: RouteCtx<P>) => {
    try {
      const user = await check(request.headers.get("Authorization"));
      return await handler(request, {
        user,
        params: await readParams(routeCtx),
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Signed in, any role. Use for things every user may see (their own account). */
export function withUser<P = Record<string, string>>(handler: Handler<P>) {
  return guarded<P>(requireUser, handler);
}

/**
 * Guard for routes that keep their own try/catch and error mapping.
 *
 * Returns null when the caller is an admin, or a Response to return as-is —
 * the same shape as `requirePosterAuth`, so the two auth systems read
 * identically at the call site. Every dashboard route starts with:
 *
 *     const denied = await requireAdminResponse(request);
 *     if (denied) return denied;
 */
export async function requireAdminResponse(
  request: Request,
): Promise<Response | null> {
  try {
    await requireAdmin(request.headers.get("Authorization"));
    return null;
  } catch (error) {
    return errorResponse(error);
  }
}

/** Signed in AND on the admin allow-list. This guards every dashboard tab. */
export function withAdmin<P = Record<string, string>>(handler: Handler<P>) {
  return guarded<P>(requireAdmin, handler);
}

/** Signed in AND in SUPER_ADMIN_EMAIL. Only these may grant/revoke admin. */
export function withSuperAdmin<P = Record<string, string>>(
  handler: Handler<P>,
) {
  return guarded<P>(requireSuperAdmin, handler);
}
