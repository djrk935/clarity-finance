import { z } from "zod";
import { getPlaidClient, listPlaidItems, removePlaidItem } from "@/lib/plaid";
import { clearDataCache } from "@/lib/data/cache";
import { clearItemTransactions, txnStoreEnabled } from "@/lib/data/txn-store";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// item_id targets one bank; omit it to disconnect every linked bank.
const BodySchema = z.object({ item_id: z.string().min(1).optional() });

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  let itemId: string | undefined;
  try {
    // Legacy/empty bodies mean "disconnect everything".
    const text = await request.text();
    itemId = text ? BodySchema.parse(JSON.parse(text)).item_id : undefined;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    // Ownership check: only the caller's own items are ever touched.
    const items = await listPlaidItems(userId);
    const targets = itemId ? items.filter((i) => i.itemId === itemId) : items;
    if (itemId && targets.length === 0) {
      return Response.json({ error: "No such linked bank" }, { status: 404 });
    }

    const client = getPlaidClient();
    for (const item of targets) {
      // Deactivate at Plaid too (stops it staying active/billing). Best-effort:
      // a Plaid outage shouldn't block the user from disconnecting.
      if (client) {
        try {
          await client.itemRemove({ access_token: item.accessToken });
        } catch (err) {
          console.error("Plaid item removal failed (continuing local disconnect):", err);
        }
      }
      // Stored transactions first, then the item row: if the wipe fails we
      // return 500 with the link intact, so a retry can clean up consistently.
      if (txnStoreEnabled()) await clearItemTransactions(userId, item.itemId);
      await removePlaidItem(userId, item.itemId);
    }

    clearDataCache(userId);
    return Response.json({ ok: true, removed: targets.length });
  } catch (err) {
    console.error("Disconnect failed:", err);
    return Response.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
