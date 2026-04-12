import Link from "next/link";
import Image from "next/image";
import { AgentPill } from "./AgentPill";
import { ConnectWallet } from "./ConnectWallet";

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
            <div
              className="relative w-12 h-12 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
              style={{
                filter:
                  "drop-shadow(0 0 14px hsl(var(--primary) / 0.35)) drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
              }}
            >
              <Image
                src="/images/calypso-logo.svg"
                alt="Calypso"
                width={48}
                height={48}
                priority
              />
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
          <AgentPill />
          <div className="hidden md:flex items-center gap-2">
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
