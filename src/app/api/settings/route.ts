import { z } from "zod";
import { loadSettings, saveSettings } from "@/lib/data/settings-store";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loose parse (type-coercion only). Range clamping/rounding is owned by
// normalize() in the settings store, so it applies to every write path.
const BodySchema = z.object({
  userName: z.string().optional(),
  buffer: z.coerce.number().optional(),
  savingsGoal: z.coerce.number().optional(),
  extraDebtPayment: z.coerce.number().optional(),
  billWindowDays: z.coerce.number().optional(),
});

export async function GET() {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;
  return Response.json(await loadSettings());
}

export async function POST(request: Request) {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  let patch;
  try {
    patch = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid settings" }, { status: 400 });
  }

  const settings = await saveSettings(patch);
  return Response.json({ ok: true, settings });
}
