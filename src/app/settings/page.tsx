import { loadSettings } from "@/lib/data/settings-store";
import { PageHead } from "@/components/dashboard/PageHead";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAuthed())) return null;
  const settings = await loadSettings();

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Tune the numbers behind safe-to-spend and your payoff plan."
      />
      <SettingsForm initial={settings} />
    </>
  );
}
