import { ScheduleError, finalizeTodaysPublicPost } from "@/lib/schedule";
import { requirePosterAuth } from "@/lib/poster-auth";

export const dynamic = "force-dynamic";

/**
 * Finalize is a state MUTATION, so it is POST-only and authenticated. It used
 * to be an open GET, which meant any crawler, link unfurler, or prefetch could
 * silently burn the next queued post.
 *
 * No permissive CORS here: the caller is the poster script, not a browser.
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

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/finalize/[username]">,
) {
  const denied = requirePosterAuth(request);
  if (denied) {
    return denied;
  }

  try {
    const { username } = await ctx.params;

    let instagramPostUrl: unknown = undefined;
    try {
      const body = await request.json();
      instagramPostUrl = body?.instagramPostUrl;
    } catch {
      // Body is optional — finalize still flips the flag without a URL.
    }

    const result = await finalizeTodaysPublicPost(username, instagramPostUrl);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
