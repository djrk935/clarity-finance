import { z } from "zod";
import { loadSettings, saveSettings } from "@/lib/data/settings-store";
import { currentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loose parse (type-coercion only). Range clamping/rounding is owned by
// normalize()/sanitizeBudgets in the settings store, applied on every write.
const BodySchema = z.object({
  userName: z.string().optional(),
  buffer: z.coerce.number().optional(),
  savingsGoal: z.coerce.number().optional(),
  extraDebtPayment: z.coerce.number().optional(),
  billWindowDays: z.coerce.number().optional(),
  budgets: z
    .array(z.object({ category: z.string(), limit: z.coerce.number() }))
    .max(100)
    .optional(),
  // Strict boolean (not coerced — "false" must not become true).
  alertsEnabled: z.boolean().optional(),
  alertEmail: z.string().max(254).optional(),
  alertSafeToSpendBelow: z.coerce.number().optional(),
});

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  return Response.json(await loadSettings(userId));
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  let patch;
  try {
    patch = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid settings" }, { status: 400 });
  }

  const settings = await saveSettings(userId, patch);
  return Response.json({ ok: true, settings });
}
