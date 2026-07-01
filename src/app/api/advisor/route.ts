import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getSnapshot } from "@/lib/data/store";
import { buildSystemPrompt, ruleBasedReply } from "@/lib/advisor";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const BodySchema = z
  .object({
    messages: z.array(MessageSchema).min(1).max(40),
  })
  .refine((b) => b.messages.some((m) => m.role === "user"), {
    message: "at least one user message is required",
  });

function textResponse(text: string): Response {
  return new Response(text, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const unauth = await requireApiAuth();
  if (unauth) return unauth;

  let messages: { role: "user" | "assistant"; content: string }[];
  try {
    messages = BodySchema.parse(await request.json()).messages;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Snapshot keeps every answer grounded in the user's real numbers.
  const snapshot = await getSnapshot();

  // No key configured → always-on, deterministic rule-based advisor.
  if (!process.env.ANTHROPIC_API_KEY) {
    return textResponse(ruleBasedReply(lastUser, snapshot));
  }

  // Live Claude path — streamed, with the recent conversation for follow-ups.
  // Stream errors surface *after* the response starts (bad key, upstream 4xx/5xx,
  // network drop) and the AI SDK's text stream drops them silently, so we can't
  // rely on try/catch. Instead we consume the stream ourselves: if nothing was
  // emitted (early error or empty), fall back to the grounded rule-based reply.
  try {
    const result = streamText({
      model: anthropic(process.env.ADVISOR_MODEL ?? "claude-sonnet-4-6"),
      system: buildSystemPrompt(snapshot),
      messages: messages.slice(-20),
      maxOutputTokens: 400,
      temperature: 0.4,
      onError: (e) => console.error("Advisor stream error:", e),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let emitted = false;
        try {
          for await (const delta of result.textStream) {
            if (delta) {
              emitted = true;
              controller.enqueue(encoder.encode(delta));
            }
          }
        } catch (err) {
          console.error("Advisor (Claude) stream failed:", err);
        }
        if (!emitted) {
          controller.enqueue(encoder.encode(ruleBasedReply(lastUser, snapshot)));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("Advisor (Claude) failed, using rule-based fallback:", err);
    return textResponse(ruleBasedReply(lastUser, snapshot));
  }
}
