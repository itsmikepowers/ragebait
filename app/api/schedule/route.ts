import {
  ScheduleError,
  createScheduledItem,
  listScheduledItems,
} from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const formData = await request.formData();
    const scheduledDate = formData.get("scheduledDate");
    const accountId = formData.get("accountId");
    const fileValue = formData.get("file");
    const file = fileValue instanceof File ? fileValue : null;
    const item = await createScheduledItem(file, scheduledDate, accountId);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
