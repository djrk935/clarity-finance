"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUp } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SEED: Msg[] = [
  {
    role: "assistant",
    content:
      "Hi — I'm Clarity. Ask me anything about your money: what's safe to spend, where it went this month, your bills, debt payoff, or your credit card. Every answer is grounded in your real numbers.",
  },
];

const QUICK = [
  "What's safe to spend?",
  "Where did my money go this month?",
  "How much did I earn vs spend?",
  "How's my debt payoff?",
];

export function AdvisorChat({ tall = false }: { tall?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, loading]);

  // Cancel any in-flight stream and stop updating state after unmount.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  function replaceLast(content: string) {
    if (!mountedRef.current) return;
    setMsgs((m) => {
      const copy = m.slice();
      copy[copy.length - 1] = { role: "assistant", content };
      return copy;
    });
  }

  async function ask(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setInput("");
    // Send the recent conversation (minus the canned welcome) so Claude can
    // handle follow-ups; the server caps context further.
    const history = msgs.slice(1).slice(-30).map((m) => ({ role: m.role, content: m.content }));
    const outgoing = [...history, { role: "user" as const, content: message }];
    setMsgs((m) => [
      ...m,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: outgoing }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        replaceLast(acc);
      }
      acc += decoder.decode(); // flush any trailing multibyte bytes
      replaceLast(acc.trim() ? acc : "Sorry — I couldn't work that out just now.");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        replaceLast("Network hiccup — try again in a moment.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="ptitle">
        <Sparkles className="ic" size={16} aria-hidden />
        AI financial advisor
      </h2>

      <div
        className="chatlog"
        ref={logRef}
        style={tall ? { maxHeight: 520, minHeight: 380 } : undefined}
      >
        {msgs.map((m, i) => {
          const streaming =
            m.role === "assistant" &&
            m.content === "" &&
            loading &&
            i === msgs.length - 1;
          return (
            <div key={i} className={m.role === "user" ? "bubble-u" : "bubble-a"}>
              {m.content || (streaming ? "Thinking…" : "")}
            </div>
          );
        })}
      </div>

      {/* Persistent live region so assistive tech reliably announces status
          and replies (a region mounted on demand is often missed). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? "Thinking…"
          : msgs[msgs.length - 1]?.role === "assistant"
            ? msgs[msgs.length - 1].content
            : ""}
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
          <ArrowUp size={16} aria-hidden />
        </button>
      </form>
    </section>
  );
}
