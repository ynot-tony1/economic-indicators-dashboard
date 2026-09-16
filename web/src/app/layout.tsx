import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
  title: {
    default: "Economic Indicators Dashboard",
    template: "%s · Economic Indicators",
  },
  description: "Nightly-refreshed economic indicators for the US, UK, and Japan, sourced from TradingEconomics.",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--viz-surface,var(--background))]">
        <header className="sticky top-0 z-20 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[11px] font-bold text-background">
                EI
              </span>
              <span className="text-sm font-semibold tracking-tight">Economic Indicators</span>
            </Link>
            <a
              href="https://tradingeconomics.com/indicators"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Data source: TradingEconomics
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-xs text-muted-foreground">
            <span>Updated nightly at midnight, Europe/London time.</span>
            <span>Values are the latest figures reported by TradingEconomics at scrape time.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
