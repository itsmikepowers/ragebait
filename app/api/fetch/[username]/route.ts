import { ScheduleError, getTodaysPublicPost } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
};

function errorResponse(error: unknown) {
  if (error instanceof ScheduleError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: corsHeaders },
    );
  }
  console.error(error);
  return Response.json(
    { error: "Could not reach the database." },
    { status: 500, headers: corsHeaders },
  );
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/fetch/[username]">,
) {
  try {
    const { username } = await ctx.params;
    const post = await getTodaysPublicPost(username);
    return Response.json(post, { headers: corsHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
