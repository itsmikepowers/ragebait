import { AccountError, createAccountLogoUpload } from "@/lib/accounts";
import { requireAdminResponse } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AccountError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  if (
    error instanceof Error &&
    (error.message.includes("CLOUDFLARE_CONFIG") ||
      error.message.includes("Cloudflare"))
  ) {
    return Response.json({ error: "Could not upload that image." }, { status: 500 });
  }
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function POST(request: Request) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const body = await request.json();
    const upload = await createAccountLogoUpload(body?.size, body?.contentType);
    return Response.json(upload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Upload an image." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
