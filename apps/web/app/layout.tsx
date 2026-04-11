import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "../components/WalletProvider";
import { NavBar } from "../components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Calypso Swarm — Paid market simulation for Stellar",
  description:
    "Pay-per-call DeFi market simulation for Stellar. x402 USDC micropayments spin up AI-orchestrated bot swarms that trade real Hoops router paths across Soroswap, Phoenix, Comet, and Aquarius.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <WalletProvider>
          <NavBar />
          <main className="flex-1 pt-[72px]">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
