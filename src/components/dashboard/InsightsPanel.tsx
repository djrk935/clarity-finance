import { Lightbulb } from "lucide-react";
import type { Insight, InsightTone } from "@/lib/types";

const DOT: Record<InsightTone, string> = {
  warn: "var(--neg)",
  good: "var(--pos)",
  info: "var(--info)",
};

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <section className="panel">
      <h2 className="ptitle">
        <Lightbulb className="ic" size={16} aria-hidden />
        Proactive insights
      </h2>
      {insights.map((i) => (
        <div key={i.id} className={`insight ${i.tone}`}>
          <span className="idot" style={{ background: DOT[i.tone] }} aria-hidden />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{i.title}</div>
            <div
              style={{
                fontSize: 13,
                color: "var(--muted)",
                lineHeight: 1.45,
                marginTop: 2,
              }}
            >
              {i.detail}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
