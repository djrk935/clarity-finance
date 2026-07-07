/** User accounts for the multi-tenant app. Dual-mode like every other store:
 *  Postgres `users` table in production, .plaid/users.json for local dev.
 *
 *  Passwords are hashed with Node's built-in scrypt (random per-user salt,
 *  parameters embedded in the stored string so they can be raised later
 *  without invalidating old hashes). No plaintext ever touches disk. */

import { promises as fs } from "fs";
import path from "path";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { pool } from "../token-store";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const USERS_FILE = path.join(process.cwd(), ".plaid", "users.json");

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

interface UserRecord extends PublicUser {
  passwordHash: string;
  createdAt: string;
}

/* ---------------- password hashing ---------------- */

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPasswordHash(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** One normalization choke point for emails (also used by signup). */
export function normalizeAccountEmail(v: unknown): string {
  if (typeof v !== "string") return "";
  const e = v.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

/* ---------------- file mode ---------------- */

async function fileReadAll(): Promise<UserRecord[]> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
    return Array.isArray(raw) ? (raw as UserRecord[]) : [];
  } catch {
    return [];
  }
}

async function fileWriteAll(users: UserRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

/* ---------------- postgres mode ---------------- */

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS users (
       id TEXT PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       name TEXT NOT NULL DEFAULT '',
       password_hash TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

/* ---------------- public API ---------------- */

export async function createUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ user: PublicUser } | { error: "invalid-email" | "exists" }> {
  const email = normalizeAccountEmail(input.email);
  if (!email) return { error: "invalid-email" };
  const record: UserRecord = {
    id: randomUUID(),
    email,
    name: (input.name ?? "").trim().slice(0, 40),
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };

  if (isPostgres) {
    await pgEnsure();
    try {
      await pool().query(
        `INSERT INTO users (id, email, name, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [record.id, record.email, record.name, record.passwordHash, record.createdAt],
      );
    } catch (err) {
      // Unique violation → the email is taken.
      if ((err as { code?: string }).code === "23505") return { error: "exists" };
      throw err;
    }
  } else {
    const users = await fileReadAll();
    if (users.some((u) => u.email === email)) return { error: "exists" };
    users.push(record);
    await fileWriteAll(users);
  }
  return { user: { id: record.id, email: record.email, name: record.name } };
}

/** Credentials check for sign-in. Always runs the hash comparison (against a
 *  dummy hash when the email is unknown) so response timing doesn't reveal
 *  which emails have accounts. */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function verifyCredentials(
  emailRaw: string,
  password: string,
): Promise<PublicUser | null> {
  const email = normalizeAccountEmail(emailRaw);
  let record: UserRecord | null = null;
  if (email) {
    if (isPostgres) {
      await pgEnsure();
      const res = await pool().query<{
        id: string;
        email: string;
        name: string;
        password_hash: string;
      }>("SELECT id, email, name, password_hash FROM users WHERE email = $1", [email]);
      const row = res.rows[0];
      if (row) {
        record = {
          id: row.id,
          email: row.email,
          name: row.name,
          passwordHash: row.password_hash,
          createdAt: "",
        };
      }
    } else {
      record = (await fileReadAll()).find((u) => u.email === email) ?? null;
    }
  }

  const ok = await verifyPasswordHash(password, record?.passwordHash ?? DUMMY_HASH);
  if (!ok || !record) return null;
  return { id: record.id, email: record.email, name: record.name };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  if (isPostgres) {
    await pgEnsure();
    const res = await pool().query<{ id: string; email: string; name: string }>(
      "SELECT id, email, name FROM users WHERE id = $1",
      [id],
    );
    return res.rows[0] ?? null;
  }
  const u = (await fileReadAll()).find((x) => x.id === id);
  return u ? { id: u.id, email: u.email, name: u.name } : null;
}

/** Every user id — the digest cron walks this. Bounded for sanity. */
export async function listUserIds(limit = 10_000): Promise<string[]> {
  if (isPostgres) {
    await pgEnsure();
    const res = await pool().query<{ id: string }>(
      "SELECT id FROM users ORDER BY created_at ASC LIMIT $1",
      [limit],
    );
    return res.rows.map((r) => r.id);
  }
  return (await fileReadAll()).slice(0, limit).map((u) => u.id);
}

export interface UserSummary extends PublicUser {
  createdAt: string;
}

/** Account roster for the admin page (no password hashes, oldest first). */
export async function listUsers(limit = 1_000): Promise<UserSummary[]> {
  if (isPostgres) {
    await pgEnsure();
    const res = await pool().query<{
      id: string;
      email: string;
      name: string;
      created_at: Date;
    }>(
      "SELECT id, email, name, created_at FROM users ORDER BY created_at ASC LIMIT $1",
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      createdAt: r.created_at.toISOString(),
    }));
  }
  return (await fileReadAll())
    .slice(0, limit)
    .map(({ id, email, name, createdAt }) => ({ id, email, name, createdAt }));
}
