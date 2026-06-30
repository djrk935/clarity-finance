import type { CSSProperties, ReactNode } from "react";
import { Money } from "../ui/Money";

export function KpiCard({
  label,
  amount,
  valueStyle,
  children,
}: {
  label: string;
  amount: number;
  valueStyle?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="label">{label}</div>
      <div className="val tabular" style={valueStyle}>
        <Money amount={amount} />
      </div>
      {children && (
        <div style={{ marginTop: 9, fontSize: 12 }}>{children}</div>
      )}
    </section>
  );
}
