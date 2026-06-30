import { getPlaidClient, plaidConfigured, readAccessToken } from "@/lib/plaid";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  const configured = plaidConfigured();
  const accessToken = configured ? await readAccessToken() : null;

  if (!configured || !accessToken) {
    return Response.json({ configured, connected: false, accounts: [] });
  }

  const client = getPlaidClient();
  try {
    const res = await client!.accountsBalanceGet({ access_token: accessToken });
    const accounts = res.data.accounts.map((a) => ({
      id: a.account_id,
      name: a.name ?? a.official_name ?? "Account",
      type: String(a.subtype ?? a.type),
      balance: a.balances.current ?? 0,
    }));
    return Response.json({ configured: true, connected: true, accounts });
  } catch (err) {
    console.error("Plaid balance error:", err);
    return Response.json({
      configured: true,
      connected: true,
      accounts: [],
      error: "Could not fetch balances",
    });
  }
}
