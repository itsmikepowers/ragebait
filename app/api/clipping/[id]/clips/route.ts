import { getClipSource, listClipsForSource } from "@/lib/clipping";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/clipping/[id]/clips">,
) {
  try {
    const { id } = await ctx.params;
    const source = await getClipSource(id);
    if (!source) {
      return Response.json({ error: "Video not found." }, { status: 404 });
    }
    const clips = await listClipsForSource(id);
    return Response.json({ source, clips });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not reach the database." },
      { status: 500 },
    );
  }
}
