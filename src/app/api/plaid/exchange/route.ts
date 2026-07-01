import { z } from "zod";
import { getPlaidClient, saveAccessToken } from "@/lib/plaid";
import { clearDataCache } from "@/lib/data/cache";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({ public_token: z.string().min(1) });

export async function POST(request: Request) {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  const client = getPlaidClient();
  if (!client) {
    return Response.json({ error: "Plaid not configured" }, { status: 503 });
  }

  let publicToken: string;
  try {
    publicToken = BodySchema.parse(await request.json()).public_token;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });
    await saveAccessToken(res.data.access_token, res.data.item_id);
    clearDataCache();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Plaid exchange error:", err);
    return Response.json({ error: "Token exchange failed" }, { status: 500 });
  }
}
