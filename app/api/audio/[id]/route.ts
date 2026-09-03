import { AudioError, deleteAudioTrack, updateAudioTrack } from "@/lib/audio";
import { requireAdminResponse } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AudioError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/audio/[id]">,
) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const track = await updateAudioTrack(id, body ?? {});
    return Response.json({ track });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Could not update that track." },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/audio/[id]">,
) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const { id } = await ctx.params;
    await deleteAudioTrack(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
