import { clearDataCache } from "@/lib/data/cache";
import { getPlaidClient, listPlaidItems } from "@/lib/plaid";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

/** Drop the user's cached Plaid pull so the next render fetches fresh data.
 *  The Sync button calls this, then refreshes the route.
 *
 *  Also (re)registers the webhook receiver on every linked item when
 *  PLAID_WEBHOOK_URL is set: new items get it at link time, but items linked
 *  before webhooks existed need /item/webhook/update once — one tap of Sync
 *  after deploying with the env var covers it. Idempotent and best-effort:
 *  a Plaid hiccup here must not break the manual sync. */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const webhookUrl = process.env.PLAID_WEBHOOK_URL;
  if (webhookUrl) {
    const client = getPlaidClient();
    if (client) {
      for (const item of await listPlaidItems(userId)) {
        try {
          await client.itemWebhookUpdate({
            access_token: item.accessToken,
            webhook: webhookUrl,
          });
        } catch (err) {
          console.error("Plaid webhook registration failed (sync unaffected):", err);
        }
      }
    }
  }

  clearDataCache(userId);
  return Response.json({ ok: true });
}
