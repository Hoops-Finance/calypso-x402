import Link from "next/link";
import { SessionWalletPill } from "./SessionWalletPill";
import { ConnectWallet } from "./ConnectWallet";
import { FriendbotButton } from "./FriendbotButton";

export function NavBar() {
  return (
    <header
      className="fixed left-0 right-0 z-[55] border-b border-border/80 bg-background/85 backdrop-blur-xl"
      style={{ top: 28, height: 76 }}
    >
      <div className="max-w-[1280px] mx-auto h-full flex items-center justify-between px-6">
        {/* Logo lockup */}
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div
                className="w-9 h-9 flex items-center justify-center border-2 border-primary bg-primary/10 font-display font-black text-primary text-lg"
                style={{ transform: "rotate(-2deg)" }}
              >
                C
              </div>
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-background border border-primary font-mono text-[7px] text-primary flex items-center justify-center"
                style={{ fontWeight: 900 }}
              >
                ×
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-lg font-semibold text-paper tracking-tight">
                Calypso<span className="text-primary">/</span>Swarm
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground mt-1">
                stellar market simulation · x402
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.18em]">
            <NavLink href="/">home</NavLink>
            <NavLink href="/simulate">simulate</NavLink>
            <NavLink href="/sessions">sessions</NavLink>
            <NavLink href="/wallets">wallets</NavLink>
          </nav>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-3">
          <SessionWalletPill />
          <div className="hidden md:flex items-center gap-2">
            <FriendbotButton />
            <ConnectWallet />
          </div>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent hover:border-primary"
    >
      {children}
    </Link>
  );
}
