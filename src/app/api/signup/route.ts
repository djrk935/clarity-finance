/** Private-beta signup. Intentionally public (no session yet) but triple
 *  gated: per-IP + global rate limiting, and a BETA_INVITE_CODE compared in
 *  constant time — signups are closed entirely while the env var is unset. */

import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { createUser } from "@/lib/data/user-store";
import { saveSettings } from "@/lib/data/settings-store";
import { loginRateLimit, noteFailedLogin } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().max(40).optional(),
  invite: z.string().max(200),
});

function inviteValid(invite: string): boolean {
  const expected = process.env.BETA_INVITE_CODE ?? "";
  if (expected.length < 8) return false; // unset/weak → signups closed
  const a = Buffer.from(invite);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Trusted-proxy client IP (same convention as the old login route): the LAST
 *  x-forwarded-for entry is the one our proxy appended; leftmost values are
 *  client-supplied and trivially spoofed. */
function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return `signup:${parts[parts.length - 1]}`;
  }
  return `signup:${request.headers.get("x-real-ip") ?? "unknown"}`;
}

export async function POST(request: Request) {
  const key = clientKey(request);
  const limit = loginRateLimit(key);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? "Invalid request")
        : "Invalid request";
    return Response.json({ error: msg }, { status: 400 });
  }

  if (!inviteValid(body.invite)) {
    noteFailedLogin(key); // invite guessing burns the same budget as passwords
    return Response.json({ error: "Invalid invite code" }, { status: 403 });
  }

  const result = await createUser({
    email: body.email,
    password: body.password,
    name: body.name,
  });
  if ("error" in result) {
    return result.error === "exists"
      ? Response.json({ error: "That email already has an account" }, { status: 409 })
      : Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  // Seed the greeting name from signup (best-effort — settings default fine).
  if (result.user.name) {
    try {
      await saveSettings(result.user.id, { userName: result.user.name });
    } catch (err) {
      console.error("Seeding settings from signup failed:", err);
    }
  }

  return Response.json({ ok: true });
}
