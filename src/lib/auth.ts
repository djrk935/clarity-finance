/** Multi-user auth via Auth.js (next-auth v5): credentials sign-in backed by
 *  the users store, stateless JWT sessions carrying the user id (signed with
 *  AUTH_SECRET — set a long random value in production).
 *
 *  Failed sign-ins are throttled per-account plus the shared global cap in
 *  rate-limit.ts, so neither one mailbox nor rotating attackers can brute
 *  force unbounded. */

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "./data/user-store";
import { loginRateLimit, noteFailedLogin, resetLogin } from "./rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true, // DO App Platform sits behind a proxy
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const key = `signin:${email.trim().toLowerCase()}`;
        if (!loginRateLimit(key).allowed) return null;

        const user = await verifyCredentials(email, password);
        if (!user) {
          noteFailedLogin(key);
          return null;
        }
        resetLogin(key);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // `sub` defaults to user.id on sign-in; expose it as session.user.id.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** The signed-in user's id, or null. Page components guard with this:
 *  `const userId = await currentUserId(); if (!userId) return null;` */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** 401 helper for API routes (pair with currentUserId). */
export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
