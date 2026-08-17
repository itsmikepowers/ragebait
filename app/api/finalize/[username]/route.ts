import { ScheduleError, finalizeTodaysPublicPost } from "@/lib/schedule";

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
  ctx: RouteContext<"/api/finalize/[username]">,
) {
  try {
    const { username } = await ctx.params;
    const result = await finalizeTodaysPublicPost(username);
    return Response.json(result, { headers: corsHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
