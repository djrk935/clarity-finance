import { clearDataCache } from "@/lib/data/cache";
import { getPlaidClient, readAccessToken } from "@/lib/plaid";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

/** Drop the cached Plaid pull so the next render fetches fresh data.
 *  The Sync button calls this, then refreshes the route.
 *
 *  Also (re)registers the webhook receiver on the linked item when
 *  PLAID_WEBHOOK_URL is set: new items get it at link time, but the item
 *  linked before webhooks existed needs /item/webhook/update once — one tap
 *  of Sync after deploying with the env var covers it. Idempotent and
 *  best-effort: a Plaid hiccup here must not break the manual sync. */
export async function POST() {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  const webhookUrl = process.env.PLAID_WEBHOOK_URL;
  if (webhookUrl) {
    const [client, token] = [getPlaidClient(), await readAccessToken()];
    if (client && token) {
      try {
        await client.itemWebhookUpdate({ access_token: token, webhook: webhookUrl });
      } catch (err) {
        console.error("Plaid webhook registration failed (sync unaffected):", err);
      }
    }
  }

  clearDataCache();
  return Response.json({ ok: true });
}
