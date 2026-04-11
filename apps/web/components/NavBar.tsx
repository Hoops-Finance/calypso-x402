import Link from "next/link";
import Image from "next/image";
import { ConnectWallet } from "./ConnectWallet";

export function NavBar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[72px] bg-background/80 backdrop-blur-md border-b border-border/70">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/hoops-logo.svg"
              alt="Hoops"
              width={32}
              height={32}
              priority
              className="drop-shadow-[0_0_8px_hsl(var(--primary)/0.45)]"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wide text-foreground">
                Calypso <span className="text-primary">Swarm</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Stellar market simulation
              </span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              home
            </Link>
            <Link href="/simulate" className="hover:text-foreground transition-colors">
              simulate
            </Link>
            <Link href="/sessions" className="hover:text-foreground transition-colors">
              sessions
            </Link>
          </nav>
        </div>
        <ConnectWallet />
      </div>
    </header>
  );
}
