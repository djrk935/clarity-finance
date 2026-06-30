import { clearAccessToken } from "@/lib/plaid";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  await clearAccessToken();
  return Response.json({ ok: true });
}
