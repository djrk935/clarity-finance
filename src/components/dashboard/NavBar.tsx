"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  PieChart,
  Wallet,
  TrendingDown,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import { SyncButton } from "./SyncButton";

const NAV = [
  { href: "/", label: "Overview", Icon: LayoutDashboard },
  { href: "/activity", label: "Activity", Icon: Receipt },
  { href: "/reports", label: "Reports", Icon: PieChart },
  { href: "/accounts", label: "Accounts", Icon: Wallet },
  { href: "/plan", label: "Plan", Icon: TrendingDown },
  { href: "/advisor", label: "Advisor", Icon: Sparkles },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="nav">
      <div className="brand">
        <div className="bmark" aria-hidden>
          C
        </div>
        <div>
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <h1 className="bname">Clarity</h1>
          </Link>
          <div className="bsub">Personal finance</div>
        </div>
      </div>
      <nav className="navchips" aria-label="Sections">
        {NAV.map((n) => {
          const active =
            n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={active ? "nchip on" : "nchip"}
              aria-current={active ? "page" : undefined}
            >
              <n.Icon className="ic" size={15} aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link
          href="/settings"
          className={pathname.startsWith("/settings") ? "iconbtn on" : "iconbtn"}
          aria-label="Settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        >
          <SettingsIcon size={17} aria-hidden />
        </Link>
        <SyncButton />
      </div>
    </header>
  );
}
