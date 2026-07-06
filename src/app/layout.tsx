import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/dashboard/NavBar";
import { isAuthed } from "@/lib/auth";
import { LoginGate } from "@/components/auth/LoginGate";
import { PwaRegister } from "@/components/pwa/PwaRegister";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Clarity — Financial rescue, in focus",
  description:
    "A calm, honest view of your money and the plan to get back to solid ground.",
  appleWebApp: {
    capable: true,
    title: "Clarity",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authed = await isAuthed();
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        <PwaRegister />
        {authed ? (
          <div className="wrap">
            <NavBar />
            <main>{children}</main>
          </div>
        ) : (
          <LoginGate />
        )}
      </body>
    </html>
  );
}
