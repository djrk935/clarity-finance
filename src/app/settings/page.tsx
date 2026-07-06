import { loadSettings } from "@/lib/data/settings-store";
import { getDashboardData } from "@/lib/data/store";
import { suggestedBudgetLimit } from "@/lib/finance";
import { PageHead } from "@/components/dashboard/PageHead";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAuthed())) return null;
  const [settings, d] = await Promise.all([loadSettings(), getDashboardData()]);
  // Offer this month's actual spending categories when adding budgets, each
  // with a suggested limit from its trailing 3-month average (0s dropped).
  const categorySuggestions = d.spendingByCategory.map((c) => c.category);
  const suggestedLimits: Record<string, number> = {};
  for (const c of categorySuggestions) {
    const limit = suggestedBudgetLimit(d.transactions, c);
    if (limit > 0) suggestedLimits[c.toLowerCase()] = limit;
  }

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Tune the numbers behind safe-to-spend, budgets, and your payoff plan."
      />
      <SettingsForm
        initial={settings}
        categorySuggestions={categorySuggestions}
        suggestedLimits={suggestedLimits}
      />
    </>
  );
}
