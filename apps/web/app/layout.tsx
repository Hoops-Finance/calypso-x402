import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "../components/WalletProvider";
import { SessionWalletProvider } from "../components/SessionWalletProvider";
import { NavBar } from "../components/NavBar";
import { ProtocolTicker } from "../components/ProtocolTicker";

// UI chrome — clean neutral sans.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Data / HTTP / addresses — industrial slab-leaning mono.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Editorial display — variable serif with personality, used for
// oversized headlines on the session detail page and landing.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Calypso Swarm — Paid market simulation on Stellar",
  description:
    "Pay-per-call DeFi market simulation for Stellar. x402 USDC micropayments spin up AI-orchestrated bot swarms that trade real Hoops router paths across Soroswap, Phoenix, Comet, and Aquarius.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}
    >
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <WalletProvider>
          <SessionWalletProvider>
            <ProtocolTicker />
            <NavBar />
            <main className="flex-1 pt-[120px] relative z-[2]">{children}</main>
            <footer className="border-t border-border/60 mt-24 py-8 relative z-[2]">
              <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <div className="font-mono">CALYPSO/SWARM · v0.1 · STELLAR TESTNET</div>
                <div className="font-mono">GDQ4…WBIE · x402 FACILITATOR LIVE</div>
              </div>
            </footer>
          </SessionWalletProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
