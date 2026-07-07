import { clearAccessToken, getPlaidClient, readAccessToken } from "@/lib/plaid";
import { clearDataCache } from "@/lib/data/cache";
import { clearTransactionStore, txnStoreEnabled } from "@/lib/data/txn-store";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  try {
    // Deactivate the item at Plaid too (stops it staying active/billing).
    // Best-effort: a Plaid outage shouldn't block the user from disconnecting.
    const token = await readAccessToken(userId);
    const client = getPlaidClient();
    if (token && client) {
      try {
        await client.itemRemove({ access_token: token });
      } catch (err) {
        console.error("Plaid item removal failed (continuing local disconnect):", err);
      }
    }

    // Stored transactions first, then the token: if the wipe fails we return
    // 500 with the link intact, so a retry can clean up consistently.
    if (txnStoreEnabled()) await clearTransactionStore(userId);
    await clearAccessToken(userId);
    clearDataCache(userId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Disconnect failed:", err);
    return Response.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
