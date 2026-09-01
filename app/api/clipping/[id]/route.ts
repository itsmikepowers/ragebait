import {
  ClippingError,
  deleteClipSource,
  updateClipSource,
} from "@/lib/clipping";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ClippingError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/clipping/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const source = await updateClipSource(id, body ?? {});
    return Response.json({ source });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Could not update that video." },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/clipping/[id]">,
) {
  try {
    const { id } = await ctx.params;
    await deleteClipSource(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
