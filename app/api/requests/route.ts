import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth/with-auth";
import { createClipRequest, listClipRequests } from "@/lib/clip-requests";

export const dynamic = "force-dynamic";

/**
 * The user-facing queue. Available to EVERY signed-in account, not just admins
 * — this is the one part of clipping that is universal.
 *
 * Scoping is enforced here, not in the UI: a non-admin always reads with their
 * own id, so there is no request they can make that returns someone else's
 * rows. Admins may pass ?all=1 to see the whole queue.
 */
export const GET = withUser(async (request, { user }) => {
  const wantsAll = new URL(request.url).searchParams.get("all") === "1";
  const scope = wantsAll && user.isAdmin ? null : user.id;
  return NextResponse.json({ requests: await listClipRequests(scope) });
});

export const POST = withUser(async (request, { user }) => {
  let body: { youtubeUrl?: unknown; note?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Fall through — createClipRequest rejects the missing URL with a message.
  }
  const created = await createClipRequest(
    { id: user.id, email: user.email, isAdmin: user.isAdmin },
    body?.youtubeUrl,
    body?.note,
  );
  return NextResponse.json({ request: created }, { status: 201 });
});
