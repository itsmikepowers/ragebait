import { IdeaError, createIdea, listIdeas, type IdeaKind } from "@/lib/ideas";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof IdeaError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const kindParam = new URL(request.url).searchParams.get("kind");
    const kind: IdeaKind | undefined =
      kindParam === "content" || kindParam === "account" ? kindParam : undefined;
    const ideas = await listIdeas(kind);
    return Response.json({ ideas });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idea = await createIdea(body ?? {});
    return Response.json({ idea }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Add a source URL." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
