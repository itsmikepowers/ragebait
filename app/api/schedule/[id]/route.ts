import { ScheduleError, deleteScheduledItem, updateScheduledItem } from "@/lib/schedule";

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
    return Response.json({ error: "Could not remove that video." }, { status: 500 });
  }
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/schedule/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const item = await updateScheduledItem(
      id,
      body?.accountId,
      body?.scheduledDate,
    );
    return Response.json({ item });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Pick an account and a date." }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/schedule/[id]">,
) {
  try {
    const { id } = await ctx.params;
    await deleteScheduledItem(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
