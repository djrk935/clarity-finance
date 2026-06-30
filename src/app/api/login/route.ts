import { z } from "zod";
import { verifyPassword, setSession } from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({ password: z.string() });

export async function POST(request: Request) {
  let password: string;
  try {
    password = BodySchema.parse(await request.json()).password;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  await setSession();
  return Response.json({ ok: true });
}
