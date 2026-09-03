import {
  AccountError,
  createAccount,
  listAccounts,
} from "@/lib/accounts";
import { requireAdminResponse } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AccountError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function GET(request: Request) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const accounts = await listAccounts();
    return Response.json({ accounts });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const body = await request.json();
    const account = await createAccount(body ?? {});
    return Response.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Enter a name and username." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
