import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Economic Indicators Dashboard",
  description: "Nightly-refreshed economic indicators for the US, UK, and Japan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--viz-surface,var(--background))]">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Economic Indicators
            </Link>
            <a
              href="https://tradingeconomics.com/indicators"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Data source: TradingEconomics
            </a>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6">
          <div className="mx-auto max-w-6xl px-6 text-xs text-muted-foreground">
            Updated nightly at midnight UTC. Values are the latest figures reported by TradingEconomics at scrape time.
          </div>
        </footer>
      </body>
    </html>
  );
}
