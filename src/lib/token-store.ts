/** Persists the single Plaid access token.
 *
 *  Dual-mode so the same code works locally and in production:
 *   - DATABASE_URL starts with "postgres" → store in a Postgres table (survives
 *     restarts on ephemeral hosts like DigitalOcean App Platform).
 *   - otherwise → a local .plaid/token.json file (handy for local dev).
 *
 *  Only the access token needs to persist; all financial data is fetched live
 *  from Plaid on each request. */

import { promises as fs } from "fs";
import path from "path";
import { Pool } from "pg";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");

/* ---------------- local file mode ---------------- */

const TOKEN_FILE = path.join(process.cwd(), ".plaid", "token.json");

async function fileSave(accessToken: string, itemId: string): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(
    TOKEN_FILE,
    JSON.stringify({ accessToken, itemId }, null, 2),
  );
}
async function fileRead(): Promise<string | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    return (JSON.parse(raw).accessToken as string) ?? null;
  } catch {
    return null;
  }
}
async function fileClear(): Promise<void> {
  try {
    await fs.rm(TOKEN_FILE, { force: true });
  } catch {
    /* already gone */
  }
}

/* ---------------- postgres mode ---------------- */

const globalForPool = globalThis as unknown as { pgPool?: Pool };

function pool(): Pool {
  if (!globalForPool.pgPool) {
    const url = process.env.DATABASE_URL ?? "";
    globalForPool.pgPool = new Pool({
      connectionString: url,
      // Managed Postgres (DigitalOcean) presents a CA cert Node doesn't trust
      // by default — use SSL but skip chain verification.
      ssl: { rejectUnauthorized: false },
    });
  }
  return globalForPool.pgPool;
}

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS plaid_item (
       id SERIAL PRIMARY KEY,
       access_token TEXT NOT NULL,
       item_id TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}
async function pgSave(accessToken: string, itemId: string): Promise<void> {
  await pgEnsure();
  await pool().query("DELETE FROM plaid_item");
  await pool().query(
    "INSERT INTO plaid_item (access_token, item_id) VALUES ($1, $2)",
    [accessToken, itemId],
  );
}
async function pgRead(): Promise<string | null> {
  await pgEnsure();
  const res = await pool().query<{ access_token: string }>(
    "SELECT access_token FROM plaid_item ORDER BY id DESC LIMIT 1",
  );
  return res.rows[0]?.access_token ?? null;
}
async function pgClear(): Promise<void> {
  await pgEnsure();
  await pool().query("DELETE FROM plaid_item");
}

/* ---------------- public API ---------------- */

export function savePlaidToken(
  accessToken: string,
  itemId: string,
): Promise<void> {
  return isPostgres ? pgSave(accessToken, itemId) : fileSave(accessToken, itemId);
}
export function readPlaidToken(): Promise<string | null> {
  return isPostgres ? pgRead() : fileRead();
}
export function clearPlaidToken(): Promise<void> {
  return isPostgres ? pgClear() : fileClear();
}
