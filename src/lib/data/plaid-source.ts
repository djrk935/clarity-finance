/** Live account data from a linked Plaid item. Returns [] when Plaid isn't
 *  configured or no bank is linked, so callers can merge unconditionally. */

import type { AccountBase, Transaction as PlaidTxn } from "plaid";
import { getPlaidClient, readAccessToken } from "../plaid";
import type { Account, AccountType, Transaction, Debt, Bill } from "../types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toAccount(a: AccountBase): Account | null {
  const id = `plaid_${a.account_id}`;
  const name = a.name ?? a.official_name ?? "Linked account";
  const institution = "Plaid (linked)";
  const type = String(a.type);
  const subtype = String(a.subtype ?? "");

  if (type === "depository") {
    const mapped: AccountType = subtype === "checking" ? "checking" : "savings";
    return {
      id,
      name,
      institution,
      type: mapped,
      balance: round2(a.balances.current ?? a.balances.available ?? 0),
    };
  }

  if (type === "credit") {
    return {
      id,
      name,
      institution,
      type: "credit",
      balance: round2(a.balances.current ?? 0),
      creditLimit: a.balances.limit ?? undefined,
    };
  }

  // Skip loan / investment / other for now (don't want to inflate liquidity).
  return null;
}

export async function getPlaidAccounts(): Promise<Account[]> {
  const token = await readAccessToken();
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const res = await client.accountsBalanceGet({ access_token: token });
    return res.data.accounts
      .map(toAccount)
      .filter((a): a is Account => a !== null);
  } catch (err) {
    console.error("Plaid accounts fetch failed:", err);
    return [];
  }
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Plaid PFC *detailed* values that are genuinely internal money movement, not
// real spend/income. We intentionally key on `detailed` (not `primary`) so we
// only exclude account-to-account moves and credit-card payments — while
// keeping deposits, P2P income, and car/mortgage/student-loan payments as real
// income/spending. (Credit-card payments are excluded because the card's own
// purchases already count as spend, so counting the payment would double-count.)
const TRANSFER_DETAILED = new Set([
  "TRANSFER_IN_ACCOUNT_TRANSFER",
  "TRANSFER_IN_SAVINGS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_ACCOUNT_TRANSFER",
  "TRANSFER_OUT_SAVINGS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
]);

function toTransaction(t: PlaidTxn): Transaction {
  const pfc = t.personal_finance_category?.primary;
  const detailed = t.personal_finance_category?.detailed;
  const category =
    pfc === "FOOD_AND_DRINK"
      ? "Dining"
      : pfc
        ? titleCase(pfc)
        : (t.category?.[0] ?? "Other");
  return {
    id: `plaid_${t.transaction_id}`,
    date: new Date(t.date).toISOString(),
    description: t.merchant_name ?? t.name,
    // Plaid uses positive for money leaving the account; we use negative.
    amount: -t.amount,
    category,
    accountId: t.account_id,
    pending: t.pending ?? false,
    transfer: detailed ? TRANSFER_DETAILED.has(detailed) : false,
  };
}

export async function getPlaidTransactions(): Promise<Transaction[]> {
  const token = await readAccessToken();
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const added: PlaidTxn[] = [];
    let cursor: string | undefined = undefined;
    for (let i = 0; i < 5; i += 1) {
      const res = await client.transactionsSync({
        access_token: token,
        cursor,
      });
      added.push(...res.data.added);
      cursor = res.data.next_cursor;
      if (!res.data.has_more) break;
    }
    return added.map(toTransaction);
  } catch (err) {
    console.error("Plaid transactions fetch failed:", err);
    return [];
  }
}

/** Real debts from Plaid Liabilities (credit cards, student loans, mortgages).
 *  Requires the Liabilities product on the linked item. */
export async function getPlaidLiabilities(): Promise<Debt[]> {
  const token = await readAccessToken();
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const res = await client.liabilitiesGet({ access_token: token });
    const accountById = new Map(res.data.accounts.map((a) => [a.account_id, a]));
    const balanceOf = (id: string | null | undefined): number =>
      id ? round2(Math.abs(accountById.get(id)?.balances.current ?? 0)) : 0;

    const liabilities = res.data.liabilities;
    const debts: Debt[] = [];

    for (const c of liabilities?.credit ?? []) {
      const acct = c.account_id ? accountById.get(c.account_id) : undefined;
      const current = balanceOf(c.account_id) || round2(c.last_statement_balance ?? 0);
      const purchaseApr =
        (c.aprs ?? []).find((a) => String(a.apr_type) === "purchase_apr")?.apr_percentage ??
        (c.aprs ?? [])[0]?.apr_percentage ??
        0;
      debts.push({
        id: `plaid_credit_${c.account_id}`,
        name: acct?.name ?? "Credit card",
        originalBalance: current, // revolving — no original principal
        currentBalance: current,
        apr: round2(purchaseApr),
        minPayment: round2(c.minimum_payment_amount ?? Math.max(25, current * 0.02)),
      });
    }

    for (const s of liabilities?.student ?? []) {
      const acct = s.account_id ? accountById.get(s.account_id) : undefined;
      const current = balanceOf(s.account_id);
      debts.push({
        id: `plaid_student_${s.account_id}`,
        name: acct?.name ?? "Student loan",
        originalBalance: round2(s.origination_principal_amount ?? current),
        currentBalance: current,
        apr: round2(s.interest_rate_percentage ?? 0),
        minPayment: round2(s.minimum_payment_amount ?? 0),
      });
    }

    for (const m of liabilities?.mortgage ?? []) {
      const acct = m.account_id ? accountById.get(m.account_id) : undefined;
      const current = balanceOf(m.account_id);
      debts.push({
        id: `plaid_mortgage_${m.account_id}`,
        name: acct?.name ?? "Mortgage",
        originalBalance: round2(m.origination_principal_amount ?? current),
        currentBalance: current,
        apr: round2(m.interest_rate?.percentage ?? 0),
        minPayment: round2(m.next_monthly_payment ?? 0),
      });
    }

    return debts;
  } catch (err) {
    console.error("Plaid liabilities fetch failed:", err);
    return [];
  }
}

/** Real recurring bills from Plaid Recurring Transactions (outflow streams). */
export async function getPlaidRecurring(): Promise<Bill[]> {
  const token = await readAccessToken();
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const res = await client.transactionsRecurringGet({ access_token: token });
    const bills: Bill[] = [];
    for (const s of res.data.outflow_streams ?? []) {
      if (s.is_active === false) continue;
      const amount = round2(
        Math.abs(s.average_amount?.amount ?? s.last_amount?.amount ?? 0),
      );
      if (amount <= 0) continue;
      const nextDate = s.predicted_next_date ?? s.last_date;
      if (!nextDate) continue;
      const pfc = s.personal_finance_category?.primary;
      bills.push({
        id: `plaid_rec_${s.stream_id}`,
        name: s.merchant_name ?? s.description ?? "Recurring payment",
        amount,
        dueDate: new Date(nextDate).toISOString(),
        category: pfc ? titleCase(pfc) : "Recurring",
      });
    }
    return bills;
  } catch (err) {
    console.error("Plaid recurring fetch failed:", err);
    return [];
  }
}
