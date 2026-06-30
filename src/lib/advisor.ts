/** Rule-based financial advisor. Used as the always-on fallback when no
 *  ANTHROPIC_API_KEY is configured, and also defines the system prompt used
 *  for the live Claude path. Every answer is grounded in the snapshot. */

import { formatCurrency, payToUtilizationTarget, round2 } from "./finance";
import type { FinancialSnapshot } from "./types";

/** A discretionary cushion we keep back when recommending savings transfers. */
const DISCRETIONARY_CUSHION = 600;

export function recommendedToSavings(snapshot: FinancialSnapshot): number {
  const raw = snapshot.safeToSpend - DISCRETIONARY_CUSHION;
  if (raw <= 0) return 0;
  return Math.round(raw / 10) * 10; // tidy to nearest $10
}

export function buildSystemPrompt(s: FinancialSnapshot): string {
  const util = s.utilization
    ? `${s.utilization.card} ${Math.round(s.utilization.pct)}% utilization (${formatCurrency(
        s.utilization.balance,
      )} of ${formatCurrency(s.utilization.limit)})`
    : "no credit cards on file";
  return [
    "You are Clarity, a calm, encouraging financial advisor inside a money-rescue app.",
    "Be concise (2–4 sentences), specific, and reference the user's real numbers.",
    "Never invent figures beyond the snapshot. Never shame the user. Suggest one clear next step.",
    "",
    `User: ${s.userName}`,
    `Safe to spend: ${formatCurrency(s.safeToSpend)}`,
    `Spendable cash (checking + cash): ${formatCurrency(s.spendable)}`,
    `Total liquidity: ${formatCurrency(s.totalLiquidity)}`,
    `Safety buffer kept aside: ${formatCurrency(s.buffer)}`,
    `Upcoming bills (next 14 days): ${formatCurrency(s.upcomingBillsTotal)} across ${s.upcomingBillsCount} bills`,
    s.nextBill
      ? `Next bill: ${s.nextBill.name} ${formatCurrency(s.nextBill.amount)}`
      : "Next bill: none",
    `Saved this month: ${formatCurrency(s.savedThisMonth)}`,
    `Debt rescue: ${formatCurrency(s.rescue.remaining)} remaining of ${formatCurrency(
      s.rescue.totalDebt,
    )} (${s.rescue.pct}% paid), debt-free target ${s.rescue.payoffDate}, ${s.rescue.monthsAhead} months ahead`,
    `Credit: ${util}`,
  ].join("\n");
}

type Intent =
  | "savings"
  | "safe"
  | "debt"
  | "bills"
  | "credit"
  | "summary"
  | "greeting"
  | "fallback";

function classify(message: string): Intent {
  const m = message.toLowerCase();
  if (/\b(hi|hey|hello|yo|sup)\b/.test(m) && m.trim().length < 16) return "greeting";
  if (/(save|saving|savings|move|transfer|put away|stash)/.test(m)) return "savings";
  if (/(safe to spend|safe spend|spend|afford|discretionary)/.test(m)) return "safe";
  if (/(debt|payoff|pay off|loan|owe|free)/.test(m)) return "debt";
  if (/(bill|due|owe soon|upcoming|rent|payment)/.test(m)) return "bills";
  if (/(credit|utiliz|score|card|sapphire)/.test(m)) return "credit";
  if (/(summary|overview|how am i|doing|status|snapshot|health)/.test(m)) return "summary";
  return "fallback";
}

/** Deterministic, grounded reply. */
export function ruleBasedReply(
  message: string,
  s: FinancialSnapshot,
): string {
  switch (classify(message)) {
    case "greeting":
      return `Hey ${s.userName} — you've got ${formatCurrency(
        s.safeToSpend,
      )} safe to spend right now and you're ${s.rescue.pct}% through your debt rescue. Ask me about savings, bills, debt, or your credit card.`;

    case "savings": {
      const rec = recommendedToSavings(s);
      if (rec <= 0) {
        return `Things are tight this period — I'd hold off on moving money to savings until after your ${formatCurrency(
          s.upcomingBillsTotal,
        )} of upcoming bills clear. Your ${formatCurrency(s.buffer)} buffer is still protected.`;
      }
      return `You can move about ${formatCurrency(
        rec,
      )} to savings and still cover every upcoming bill plus your ${formatCurrency(
        s.buffer,
      )} buffer — that leaves roughly ${formatCurrency(
        DISCRETIONARY_CUSHION,
      )} of breathing room. Want me to schedule it?`;
    }

    case "safe":
      return `Right now ${formatCurrency(
        s.safeToSpend,
      )} is safe to spend. That's your ${formatCurrency(
        s.spendable,
      )} in checking + cash, minus ${formatCurrency(
        s.upcomingBillsTotal,
      )} of bills due soon and your ${formatCurrency(s.buffer)} buffer.`;

    case "debt":
      return `You've paid off ${formatCurrency(
        s.rescue.paid,
      )} of ${formatCurrency(s.rescue.totalDebt)} (${s.rescue.pct}%). At this pace you're ${s.rescue.monthsAhead} months ahead — debt-free around ${s.rescue.payoffDate}. Throwing any extra at the highest-APR balance speeds that up.`;

    case "bills":
      return s.nextBill
        ? `You have ${formatCurrency(
            s.upcomingBillsTotal,
          )} in bills over the next two weeks, starting with ${s.nextBill.name} (${formatCurrency(
            s.nextBill.amount,
          )}). All of it is covered by your spendable cash.`
        : `No bills are due in the next two weeks — a good window to push extra toward savings or debt.`;

    case "credit": {
      if (!s.utilization)
        return `You don't have a credit card on file, so utilization isn't a concern right now.`;
      const u = s.utilization;
      const pay = payToUtilizationTarget(u.balance, u.limit, 30);
      return `${u.card} is at ${Math.round(
        u.pct,
      )}% utilization (${formatCurrency(u.balance)} of ${formatCurrency(
        u.limit,
      )}). Paying ${formatCurrency(
        pay,
        false,
      )} before the statement closes gets you under 30%, which helps your score.`;
    }

    case "summary":
      return `Snapshot: ${formatCurrency(
        s.totalLiquidity,
      )} total liquidity, ${formatCurrency(
        s.safeToSpend,
      )} safe to spend, ${formatCurrency(
        s.upcomingBillsTotal,
      )} in bills due soon, and ${formatCurrency(
        s.rescue.remaining,
      )} of debt left (${s.rescue.pct}% paid, ${s.rescue.monthsAhead} months ahead). You're trending the right way.`;

    default:
      return `I can help with what's safe to spend, how much to move to savings, your bills, your debt payoff, or your credit utilization. For example: "How much can I move to savings this month?" Right now you have ${formatCurrency(
        round2(s.safeToSpend),
      )} safe to spend.`;
  }
}
