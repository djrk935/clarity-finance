import { clearDataCache } from "@/lib/data/cache";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

/** Drop the cached Plaid pull so the next render fetches fresh data.
 *  The Sync button calls this, then refreshes the route. */
export async function POST() {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  clearDataCache();
  return Response.json({ ok: true });
}
