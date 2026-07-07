import { z } from "zod";
import { getPlaidClient, readAccessToken, saveAccessToken } from "@/lib/plaid";
import { clearDataCache } from "@/lib/data/cache";
import { clearTransactionStore, txnStoreEnabled } from "@/lib/data/txn-store";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({ public_token: z.string().min(1) });

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

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
    const previousToken = await readAccessToken(userId);

    const res = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });
    // Wipe stored transactions + sync cursor BEFORE saving the new token —
    // they belong to the previous item and must never mix with the new one.
    // (If the wipe fails we bail with a 500 and the old token stays intact.)
    if (txnStoreEnabled()) await clearTransactionStore(userId);
    await saveAccessToken(userId, res.data.access_token, res.data.item_id);
    clearDataCache(userId);

    // Deactivate the replaced item at Plaid (best-effort, after the new link
    // is safely saved — a failure here must not break the new connection).
    if (previousToken && previousToken !== res.data.access_token) {
      try {
        await client.itemRemove({ access_token: previousToken });
      } catch (err) {
        console.error("Old Plaid item removal failed (new link unaffected):", err);
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Plaid exchange error:", err);
    return Response.json({ error: "Token exchange failed" }, { status: 500 });
  }
}
