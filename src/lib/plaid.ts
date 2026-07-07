/** Server-only Plaid helpers. Returns null when keys aren't configured so the
 *  rest of the app degrades gracefully. Token persistence lives in
 *  token-store.ts (local file in dev, Postgres in production). */

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Re-export item persistence (one row per linked bank) for routes/sources.
export {
  savePlaidItem,
  listPlaidItems,
  removePlaidItem,
  findUserByItemId,
  type PlaidItem,
} from "./token-store";

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function getPlaidClient(): PlaidApi | null {
  if (!plaidConfigured()) return null;
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID as string,
        "PLAID-SECRET": process.env.PLAID_SECRET as string,
      },
    },
  });
  return new PlaidApi(configuration);
}
