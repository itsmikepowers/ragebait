import { countAccounts } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await countAccounts();
    return Response.json({ accounts });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not reach the database." }, { status: 500 });
  }
}
