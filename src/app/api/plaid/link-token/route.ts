import { Products, CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  const client = getPlaidClient();
  if (!client) {
    return Response.json({ error: "Plaid not configured" }, { status: 503 });
  }
  try {
    const res = await client.linkTokenCreate({
      user: { client_user_id: "clarity-user" },
      client_name: "Clarity",
      products: [Products.Transactions],
      // Liabilities (→ debts) and recurring transactions (→ bills) are
      // best-effort: if the bank doesn't support one, linking still succeeds
      // and we simply skip that data set.
      optional_products: [Products.Liabilities, Products.RecurringTransactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return Response.json({ link_token: res.data.link_token });
  } catch (err) {
    console.error("Plaid link-token error:", err);
    return Response.json(
      { error: "Could not create link token" },
      { status: 500 },
    );
  }
}
