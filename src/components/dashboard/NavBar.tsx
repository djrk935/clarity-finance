"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncButton } from "./SyncButton";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/activity", label: "Activity" },
  { href: "/reports", label: "Reports" },
  { href: "/accounts", label: "Accounts" },
  { href: "/plan", label: "Plan" },
  { href: "/advisor", label: "Advisor" },
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
          <div className="bsub">RESCUE MODE · ON TRACK</div>
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
              {n.label}
            </Link>
          );
        })}
      </nav>
      <SyncButton />
    </header>
  );
}
