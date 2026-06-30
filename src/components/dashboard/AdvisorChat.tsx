"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SEED: Msg[] = [
  { role: "user", content: "How much can I safely move to savings this month?" },
  {
    role: "assistant",
    content:
      "You can move about $640 to savings and still cover every upcoming bill plus your $200 buffer — that leaves roughly $600 of breathing room. Want me to schedule it?",
  },
];

const QUICK = [
  "What's safe to spend?",
  "How's my debt payoff?",
  "Should I worry about my credit card?",
];

export function AdvisorChat({ tall = false }: { tall?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, loading]);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setLoading(true);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { reply?: string };
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply ?? "Sorry — I couldn't work that out just now.",
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: "Network hiccup — try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ◈
        </span>{" "}
        AI financial advisor
      </h2>

      <div
        className="chatlog"
        ref={logRef}
        style={tall ? { maxHeight: 520, minHeight: 380 } : undefined}
      >
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "bubble-u" : "bubble-a"}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="bubble-a" aria-live="polite">
            Thinking…
          </div>
        )}
      </div>

      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}
      >
        {QUICK.map((q) => (
          <button
            key={q}
            className="nchip"
            onClick={() => ask(q)}
            disabled={loading}
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="ainput"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your money…"
          aria-label="Ask the advisor"
        />
        <button
          type="submit"
          className="cta sm"
          disabled={loading}
          aria-label="Send"
        >
          ➤
        </button>
      </form>
    </section>
  );
}
