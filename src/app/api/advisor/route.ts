import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getSnapshot } from "@/lib/data/store";
import { buildSystemPrompt, ruleBasedReply } from "@/lib/advisor";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  message: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  let message: string;
  try {
    const parsed = BodySchema.parse(await request.json());
    message = parsed.message;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Snapshot keeps every answer grounded in the user's real numbers.
  const snapshot = await getSnapshot();

  // No key configured → always-on, deterministic rule-based advisor.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      reply: ruleBasedReply(message, snapshot),
      source: "rules",
    });
  }

  // Live Claude path. Any failure degrades gracefully to the rule-based reply.
  try {
    const { text } = await generateText({
      model: anthropic(process.env.ADVISOR_MODEL ?? "claude-sonnet-4-6"),
      system: buildSystemPrompt(snapshot),
      prompt: message,
      maxOutputTokens: 300,
      temperature: 0.4,
    });
    const reply = text.trim();
    return Response.json({
      reply: reply.length > 0 ? reply : ruleBasedReply(message, snapshot),
      source: "claude",
    });
  } catch (err) {
    console.error("Advisor (Claude) failed, using rule-based fallback:", err);
    return Response.json({
      reply: ruleBasedReply(message, snapshot),
      source: "rules-fallback",
    });
  }
}
