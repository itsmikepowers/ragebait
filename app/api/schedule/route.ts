import {
  ScheduleError,
  createScheduledItem,
  listScheduledItems,
} from "@/lib/schedule";

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

export async function GET() {
  try {
    const items = await listScheduledItems();
    return Response.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await createScheduledItem(
      body?.scheduledDate,
      body?.accountId,
      body?.video,
      body?.thumbnail,
      body?.caption,
      body?.firstComment,
      body?.instagramPostUrl,
    );
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Upload an MP4." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
