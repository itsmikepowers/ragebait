import { ScheduleError, getTodaysPublicPost } from "@/lib/schedule";
import { requirePosterAuth } from "@/lib/poster-auth";

export const dynamic = "force-dynamic";

/**
 * Read-only, but it exposes unpublished captions and media, so it requires the
 * same poster key as finalize. Wildcard CORS is gone: the poster script is not
 * a browser and does not need it.
 */
function errorResponse(error: unknown) {
  if (error instanceof ScheduleError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: "Could not reach the database." },
    { status: 500 },
  );
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/fetch/[username]">,
) {
  const denied = requirePosterAuth(request);
  if (denied) {
    return denied;
  }

  try {
    const { username } = await ctx.params;
    const post = await getTodaysPublicPost(username);
    return Response.json(post);
  } catch (error) {
    return errorResponse(error);
  }
}
