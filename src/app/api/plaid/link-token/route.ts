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
  // Liabilities (→ debts) is generally available, so it's always best-effort.
  // Recurring transactions (→ bills) is a GATED Plaid add-on: in production it
  // requires approved product access, and listing a product you can't access
  // makes /link/token/create fail (blocking linking entirely). So only request
  // it when explicitly enabled via PLAID_ENABLE_RECURRING=true.
  const optionalProducts = [Products.Liabilities];
  if (process.env.PLAID_ENABLE_RECURRING === "true") {
    optionalProducts.push(Products.RecurringTransactions);
  }

  try {
    const res = await client.linkTokenCreate({
      user: { client_user_id: "clarity-user" },
      client_name: "Clarity",
      products: [Products.Transactions],
      optional_products: optionalProducts,
      // Backfill up to 2 years of history on new links (default is ~90 days,
      // which silently truncates the yearly reports). Fixed at link time.
      transactions: { days_requested: 730 },
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
