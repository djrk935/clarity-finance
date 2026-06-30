import { z } from "zod";
import { verifyPassword, setSession } from "@/lib/auth";
import { loginRateLimit, noteFailedLogin, resetLogin } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({ password: z.string() });

/** Best-effort client IP for per-IP rate-limiting. Use the LAST x-forwarded-for
 *  entry — the one appended by our trusted proxy — since the leftmost values are
 *  client-supplied and trivially spoofed. (The global cap in rate-limit.ts is
 *  the real backstop if this is ever wrong.) */
function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const key = clientKey(request);

  const limit = loginRateLimit(key);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let password: string;
  try {
    password = BodySchema.parse(await request.json()).password;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    noteFailedLogin(key);
    return Response.json({ ok: false }, { status: 401 });
  }

  resetLogin(key);
  await setSession();
  return Response.json({ ok: true });
}
