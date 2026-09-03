import { countAccounts } from "@/lib/accounts";
import { requireAdminResponse } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const accounts = await countAccounts();
    return Response.json({ accounts });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not reach the database." }, { status: 500 });
  }
}
