/** Plaid webhook receiver — the ONE intentionally-public API route (Plaid
 *  can't send a session cookie, so requireApiAuth must not be used here).
 *  Instead, every request must carry a valid Plaid-Verification JWT (ES256)
 *  whose key we fetch from Plaid's verification-key endpoint and whose body
 *  hash matches the raw payload. Anything unverified is rejected before the
 *  body is even parsed, and responses never contain data.
 *
 *  Payload contents are untrusted input: we branch only on known enum values
 *  and never treat anything in the body as an instruction or echo it back. */

import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as cryptoVerify,
  type JsonWebKey as CryptoJwk,
} from "crypto";
import { after } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { findUserByItemId } from "@/lib/token-store";
import { clearDataCache } from "@/lib/data/cache";
import { getPlaidTransactions } from "@/lib/data/plaid-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verification keys rotate rarely — cache by kid (globalThis: shared across
 *  Next's separate route/page bundles, like the other caches). */
const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const g = globalThis as unknown as {
  plaidWebhookKeys?: Map<string, { jwk: CryptoJwk; at: number }>;
};

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function fetchVerificationKey(kid: string): Promise<CryptoJwk | null> {
  const cache = (g.plaidWebhookKeys ??= new Map());
  const hit = cache.get(kid);
  if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.jwk;

  const client = getPlaidClient();
  if (!client) return null;
  try {
    const res = await client.webhookVerificationKeyGet({ key_id: kid });
    const key = res.data.key;
    // A rotated-out key must not validate new webhooks.
    if (key.expired_at != null) return null;
    const jwk = key as unknown as CryptoJwk;
    cache.set(kid, { jwk, at: Date.now() });
    return jwk;
  } catch (err) {
    console.error("Plaid verification key fetch failed:", err);
    return null;
  }
}

function sha256HexEquals(rawBody: string, expectedHex: unknown): boolean {
  if (typeof expectedHex !== "string") return false;
  const actual = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(expectedHex);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Full Plaid webhook verification: ES256 JWT signature against the fetched
 *  key, freshness (iat within 5 minutes), and raw-body SHA-256 match. */
async function verifyPlaidWebhook(jwt: string, rawBody: string): Promise<boolean> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;

  const header = b64urlJson(h);
  if (!header || header.alg !== "ES256" || typeof header.kid !== "string") {
    return false;
  }
  const jwk = await fetchVerificationKey(header.kid);
  if (!jwk) return false;

  let signatureOk = false;
  try {
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    signatureOk = cryptoVerify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      // Plaid signs JWS-style: raw r||s signature, not DER.
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    );
  } catch {
    return false;
  }
  if (!signatureOk) return false;

  const payload = b64urlJson(p);
  if (!payload) return false;
  const iat = Number(payload.iat);
  if (!Number.isFinite(iat) || Math.abs(Date.now() / 1000 - iat) > 300) {
    return false; // stale or from-the-future token — replay guard
  }
  return sha256HexEquals(rawBody, payload.request_body_sha256);
}

export async function POST(request: Request) {
  const jwt = request.headers.get("plaid-verification") ?? "";
  const rawBody = await request.text();
  // Plaid webhook bodies are tiny; anything huge isn't Plaid.
  if (!jwt || rawBody.length > 100_000) {
    return Response.json({ error: "unverified" }, { status: 401 });
  }
  if (!(await verifyPlaidWebhook(jwt, rawBody))) {
    return Response.json({ error: "unverified" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }

  const type = typeof body.webhook_type === "string" ? body.webhook_type : "";
  const code = typeof body.webhook_code === "string" ? body.webhook_code : "";
  const itemId = typeof body.item_id === "string" ? body.item_id : "";

  // Route the event to its tenant. An item we don't know (already
  // disconnected, or someone else's) is acknowledged and ignored.
  const owner = itemId ? await findUserByItemId(itemId) : null;
  if (!owner) {
    return Response.json({ ok: true });
  }

  if (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") {
    // Respond 200 immediately; the sync runs after the response is sent.
    // getPlaidTransactions performs the same guarded incremental sync the
    // pages use (cursor CAS makes a race with a page-load sync harmless).
    after(async () => {
      try {
        // Sync just the bank the webhook is about.
        await getPlaidTransactions(owner.userId, [
          { itemId, accessToken: owner.accessToken },
        ]);
        clearDataCache(owner.userId);
      } catch (err) {
        console.error("Webhook-triggered sync failed:", err);
      }
    });
  } else if (type === "LIABILITIES" || (type === "ITEM" && code === "DEFAULT_UPDATE")) {
    // Balances/liabilities are fetched live per request — dropping the raw
    // cache is all it takes for the next render to be fresh.
    after(() => clearDataCache(owner.userId));
  } else {
    // Known-but-unhandled codes (ITEM errors, historical-update, etc.) are
    // acknowledged so Plaid doesn't retry; log the code only, never the body.
    console.log(`Plaid webhook ignored: ${type.slice(0, 40)}/${code.slice(0, 40)}`);
  }

  return Response.json({ ok: true });
}
