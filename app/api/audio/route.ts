import { AudioError, createAudioTrack, listAudioTracks } from "@/lib/audio";

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

export async function GET() {
  try {
    const tracks = await listAudioTracks();
    return Response.json({ tracks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const track = await createAudioTrack(body ?? {});
    return Response.json({ track }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Upload an audio file." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
