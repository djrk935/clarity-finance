import { getPlaidClient, plaidConfigured, listPlaidItems } from "@/lib/plaid";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Link status per bank: which institutions are connected and their accounts.
 *  Powers the Accounts page's ConnectBank panel. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const configured = plaidConfigured();
  const items = configured ? await listPlaidItems(userId) : [];
  const client = getPlaidClient();

  if (!configured || items.length === 0 || !client) {
    return Response.json({ configured, connected: false, banks: [] });
  }

  const banks = await Promise.all(
    items.map(async (item) => {
      try {
        const res = await client.accountsBalanceGet({
          access_token: item.accessToken,
        });
        return {
          itemId: item.itemId,
          institution: item.institution,
          accounts: res.data.accounts.map((a) => ({
            id: a.account_id,
            name: a.name ?? a.official_name ?? "Account",
            type: String(a.subtype ?? a.type),
            balance: a.balances.current ?? 0,
          })),
        };
      } catch (err) {
        console.error("Plaid balance error:", err);
        return {
          itemId: item.itemId,
          institution: item.institution,
          accounts: [],
          error: "Could not fetch balances",
        };
      }
    }),
  );

  return Response.json({ configured: true, connected: true, banks });
}
