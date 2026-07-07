import { z } from "zod";
import { getPlaidClient, savePlaidItem } from "@/lib/plaid";
import { clearDataCache } from "@/lib/data/cache";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  public_token: z.string().min(1),
  // Bank name from Link's onSuccess metadata — display label only.
  institution: z.string().max(60).optional(),
});

/** Exchange a Link public token and ADD the bank to the user's linked items.
 *  Multi-bank: linking Chase never disturbs an existing Bank of America item —
 *  each keeps its own token, sync cursor, and transactions. Re-linking the
 *  same item just refreshes its token. */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const client = getPlaidClient();
  if (!client) {
    return Response.json({ error: "Plaid not configured" }, { status: 503 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await client.itemPublicTokenExchange({
      public_token: body.public_token,
    });
    await savePlaidItem(userId, {
      itemId: res.data.item_id,
      accessToken: res.data.access_token,
      institution: body.institution,
    });
    clearDataCache(userId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Plaid exchange error:", err);
    return Response.json({ error: "Token exchange failed" }, { status: 500 });
  }
}
