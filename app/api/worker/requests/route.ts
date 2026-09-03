import { NextResponse } from "next/server";
import { requirePosterAuth } from "@/lib/poster-auth";
import {
  claimNextRequest,
  listClipRequests,
  RequestError,
} from "@/lib/clip-requests";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof RequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json(
    { error: "Could not reach the database." },
    { status: 500 },
  );
}

/**
 * The worker's view of the queue. Authenticated with POSTER_API_KEY, not a user
 * session — the renderer runs on a Mac, not in a browser.
 *
 * GET  — peek at the queue without claiming anything (for `clipkit jobs`).
 * POST — atomically CLAIM the oldest queued job and mark it processing.
 *
 * The claim is a single findOneAndUpdate, so two workers polling at once can
 * never take the same job.
 */
export async function GET(request: Request) {
  const denied = requirePosterAuth(request);
  if (denied) {
    return denied;
  }
  try {
    return NextResponse.json({ requests: await listClipRequests(null) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const denied = requirePosterAuth(request);
  if (denied) {
    return denied;
  }
  try {
    const claimed = await claimNextRequest();
    if (!claimed) {
      return NextResponse.json({ request: null }, { status: 200 });
    }
    return NextResponse.json({ request: claimed });
  } catch (error) {
    return errorResponse(error);
  }
}
