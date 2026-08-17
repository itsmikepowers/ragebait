import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

function passwordsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.WEBSITE_DASHBOARD_PASSWORD;
  if (!expected) {
    return Response.json({ authenticated: false }, { status: 500 });
  }

  let password = "";
  try {
    const body = await request.json();
    if (typeof body?.password === "string") {
      password = body.password;
    }
  } catch {
    return Response.json({ authenticated: false }, { status: 400 });
  }

  if (!passwordsMatch(password, expected)) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  return Response.json({ authenticated: true });
}
