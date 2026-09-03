import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth/with-auth";
import { deleteClipRequest, getClipRequest } from "@/lib/clip-requests";
import { listClipsForSource } from "@/lib/clipping";

export const dynamic = "force-dynamic";

/**
 * One request, plus its finished clips once the worker has produced them.
 *
 * Admins read unscoped; everyone else is pinned to their own id, so fetching
 * another user's request id returns 404 rather than leaking that it exists.
 */
export const GET = withUser<{ id: string }>(async (_request, { user, params }) => {
  const scope = user.isAdmin ? null : user.id;
  const found = await getClipRequest(params.id, scope);
  if (!found) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const clips = found.sourceId
    ? await listClipsForSource(found.sourceId, scope)
    : [];
  return NextResponse.json({ request: found, clips });
});

export const DELETE = withUser<{ id: string }>(
  async (_request, { user, params }) => {
    await deleteClipRequest(params.id, user.isAdmin ? null : user.id);
    return NextResponse.json({ ok: true });
  },
);
