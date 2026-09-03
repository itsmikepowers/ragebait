import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/auth/with-auth";
import { setUserAdmin, UserError } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * The admin toggle. SUPER-admin only, deliberately: an admin being able to
 * promote other admins means one compromised account escalates into permanent
 * shared control. Super admins come from Doppler and can't be edited here.
 */
export const PATCH = withSuperAdmin<{ id: string }>(
  async (request, { params }) => {
    let isAdmin: unknown;
    try {
      const body = (await request.json()) as { isAdmin?: unknown };
      isAdmin = body?.isAdmin;
    } catch {
      throw new UserError("Send isAdmin.", 400);
    }
    if (typeof isAdmin !== "boolean") {
      throw new UserError("Send isAdmin.", 400);
    }

    const user = await setUserAdmin(params.id, isAdmin);
    return NextResponse.json({ user });
  },
);
