/** Pure mapping from Plaid API shapes → our domain Transaction. No runtime
 *  imports (types only), so the unit tests can exercise it directly. */

import type { Transaction as PlaidTxn } from "plaid";
import type { Transaction } from "../types";

// Plaid PFC *detailed* values that are genuinely internal money movement, not
// real spend/income. We intentionally key on `detailed` (not `primary`) so we
// only exclude account-to-account moves and credit-card payments — while
// keeping deposits, P2P income, and car/mortgage/student-loan payments as real
// income/spending. (Credit-card payments are excluded because the card's own
// purchases already count as spend, so counting the payment would double-count.)
export const TRANSFER_DETAILED = new Set([
  "TRANSFER_IN_ACCOUNT_TRANSFER",
  "TRANSFER_IN_SAVINGS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_ACCOUNT_TRANSFER",
  "TRANSFER_OUT_SAVINGS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
]);

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function toTransaction(t: PlaidTxn): Transaction {
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
