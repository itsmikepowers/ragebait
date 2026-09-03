import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

/**
 * The identity endpoint. Verifies the Firebase ID token, creates the Mongo user
 * row on first sign in, and returns the role flags the UI gates on.
 *
 * Every signed-in user may call this — it only ever returns their own row.
 */
export const GET = withUser(async (_request, { user }) => {
  return NextResponse.json({ user });
});
