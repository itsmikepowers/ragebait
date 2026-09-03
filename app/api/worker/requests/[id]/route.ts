import { NextResponse } from "next/server";
import { requirePosterAuth } from "@/lib/poster-auth";
import {
  RequestError,
  releaseRequest,
  updateClipRequest,
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
 * Worker progress reporting.
 *
 * PATCH — set status/title/sourceId/clipCount/error as the job moves along.
 * POST  — release a claimed job back to `queued` (crash recovery, or a retry).
 *
 * Both take the poster key. Deliberately separate from the user-facing
 * /api/requests/[id]: a user must never be able to mark their own job done.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requirePosterAuth(request);
  if (denied) {
    return denied;
  }
  try {
    const { id } = await ctx.params;
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new RequestError("Send a JSON body.", 400);
    }
    const updated = await updateClipRequest(id, body);
    return NextResponse.json({ request: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requirePosterAuth(request);
  if (denied) {
    return denied;
  }
  try {
    const { id } = await ctx.params;
    return NextResponse.json({ request: await releaseRequest(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
