import { loadSettings } from "@/lib/data/settings-store";
import { getDashboardData } from "@/lib/data/store";
import { PageHead } from "@/components/dashboard/PageHead";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAuthed())) return null;
  const [settings, d] = await Promise.all([loadSettings(), getDashboardData()]);
  // Offer this month's actual spending categories when adding budgets.
  const categorySuggestions = d.spendingByCategory.map((c) => c.category);

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Tune the numbers behind safe-to-spend, budgets, and your payoff plan."
      />
      <SettingsForm initial={settings} categorySuggestions={categorySuggestions} />
    </>
  );
}
