import { ScheduleError, completeScheduleUpload } from "@/lib/schedule";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ScheduleError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  if (
    error instanceof Error &&
    (error.message.includes("CLOUDFLARE_CONFIG") ||
      error.message.includes("Cloudflare"))
  ) {
    return Response.json({ error: "Could not upload that video." }, { status: 500 });
  }
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await completeScheduleUpload(
      body?.path,
      body?.uploadId,
      body?.parts,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Could not upload that video." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
