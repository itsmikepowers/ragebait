import {
  IDEA_VERTICALS,
  IdeaError,
  createIdea,
  listIdeas,
  type IdeaKind,
  type IdeaVertical,
} from "@/lib/ideas";
import { requireAdminResponse } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof IdeaError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not reach the database." }, { status: 500 });
}

export async function GET(request: Request) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

  try {
    const params = new URL(request.url).searchParams;
    const kindParam = params.get("kind");
    const verticalParam = params.get("vertical");
    const kind: IdeaKind | undefined =
      kindParam === "content" || kindParam === "account" ? kindParam : undefined;
    const vertical: IdeaVertical | undefined = IDEA_VERTICALS.includes(
      verticalParam as IdeaVertical,
    )
      ? (verticalParam as IdeaVertical)
      : undefined;
    const ideas = await listIdeas(kind, vertical);
    return Response.json({ ideas });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminResponse(request);
  if (denied) {
    return denied;
  }

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
