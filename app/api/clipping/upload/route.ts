import { ClippingError, createClippingUpload } from "@/lib/clipping";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ClippingError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  if (
    error instanceof Error &&
    (error.message.includes("CLOUDFLARE_CONFIG") ||
      error.message.includes("Cloudflare"))
  ) {
    return Response.json(
      { error: "Could not upload that video." },
      { status: 500 },
    );
  }
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const upload = await createClippingUpload(body?.size, body?.contentType);
    return Response.json(upload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Upload a video." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
