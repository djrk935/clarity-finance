/** Minimal single-user password gate. No external library, Node runtime.
 *
 *  Auth is ONLY enforced when APP_PASSWORD is set — so local dev stays open,
 *  while production (where you set APP_PASSWORD) requires the password.
 *
 *  The session cookie holds an HMAC of the password keyed by APP_SECRET, so a
 *  stolen cookie can't reveal the password and changing the password/secret
 *  invalidates old sessions. */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const COOKIE_NAME = "clarity_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function sessionToken(): string {
  const password = process.env.APP_PASSWORD ?? "";
  const secret = process.env.APP_SECRET ?? "clarity-dev-secret";
  return createHmac("sha256", secret).update(password).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  return expected.length > 0 && safeEqual(password, expected);
}

export async function isAuthed(): Promise<boolean> {
  if (!authEnabled()) return true;
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value ?? "";
  return value.length > 0 && safeEqual(value, sessionToken());
}

export async function setSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Guard for route handlers: returns a 401 Response if not authed, else null. */
export async function requireApiAuth(): Promise<Response | null> {
  if (await isAuthed()) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
