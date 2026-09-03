import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/with-auth";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Every registered user plus their admin state. Admin-only. */
export const GET = withAdmin(async () => {
  return NextResponse.json({ users: await listUsers() });
});
