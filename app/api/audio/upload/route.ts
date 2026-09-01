import { AudioError, createAudioUpload } from "@/lib/audio";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AudioError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  if (
    error instanceof Error &&
    (error.message.includes("CLOUDFLARE_CONFIG") ||
      error.message.includes("Cloudflare"))
  ) {
    return Response.json(
      { error: "Could not upload that audio file." },
      { status: 500 },
    );
  }
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const upload = await createAudioUpload(body?.size, body?.contentType);
    return Response.json(upload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Upload an audio file." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
