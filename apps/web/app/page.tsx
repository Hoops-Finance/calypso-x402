import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div>
      {/* HERO */}
      <section className="relative border-b border-border overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, hsl(var(--border)) 0 1px, transparent 1px 80px), repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px 80px)",
          }}
          aria-hidden
        />
        <div
          className="absolute pointer-events-none opacity-[0.05]"
          style={{
            right: "-80px",
            top: "20px",
            width: "640px",
            height: "640px",
            filter: "blur(0.5px)",
          }}
          aria-hidden
        >
          <Image src="/images/calypso-logo.svg" alt="" width={640} height={640} />
        </div>

        <div className="relative max-w-[1280px] mx-auto px-6 pt-16 pb-24 md:pt-20 md:pb-32">
          {/* Top badges — left-aligned */}
          <div className="flex items-center gap-3 mb-10">
            <span className="ship-mark">stellar · x402</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              hackathon · 2026-04-13
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left column — headline + copy + CTA */}
            <div className="lg:col-span-7">
              <h1 className="font-display text-[clamp(3rem,8vw,7rem)] leading-[0.88] font-semibold text-paper tracking-tight">
                Agent-paid
                <br />
                <span className="text-primary">bot swarms</span>
                <br />
                on <em className="font-display italic">Stellar</em>.
              </h1>
              <p className="mt-8 max-w-[540px] text-[15px] text-muted-foreground leading-relaxed">
                An autonomous agent pays USDC micropayments via x402, spins up
                a swarm of trading bots across Soroswap, Aqua, and Phoenix —
                and Gemini Flash retunes them live. Every API call is a real
                on-chain settlement. No keys, no subscriptions, no humans in the loop.
              </p>
              <div className="mt-10 flex items-center gap-3">
                <Link
                  href="/simulate"
                  className="group relative inline-flex items-center px-7 py-4 border-2 border-primary bg-primary hover:bg-primary/90 transition-colors"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-primary-foreground">
                    run a simulation →
                  </span>
                </Link>
                <Link
                  href="/wallets"
                  className="inline-flex items-center px-7 py-4 border-2 border-border hover:border-foreground/40 transition-colors"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-foreground">
                    agent treasury
                  </span>
                </Link>
              </div>
            </div>

            {/* Right column — pricing card + protocol stack */}
            <div className="lg:col-span-5 space-y-4">
              <div className="relative border border-border-strong bg-card/60 backdrop-blur corner-marks">
                <div className="hazard-stripes h-1 w-full" aria-hidden />
                <div className="p-5">
                  <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                    published fees · x402 gated
                  </div>
                  <div className="space-y-1 font-mono text-xs">
                    <PriceRow method="POST" path="/plan" price="$0.01" />
                    <PriceRow method="POST" path="/simulate" price="$0.05" />
                    <PriceRow method="POST" path="/analyze" price="$0.01" />
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                        facilitator
                      </div>
                      <div className="font-mono text-[10px] text-foreground mt-0.5">
                        local · in-process
                      </div>
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                      stellar testnet
                    </div>
                  </div>
                </div>
              </div>

              {/* Protocol venues — compact row */}
              <div className="grid grid-cols-4 gap-2">
                {["soroswap", "phoenix", "aqua", "hoops"].map((p) => (
                  <div
                    key={p}
                    className="border border-border bg-card/30 py-3 flex flex-col items-center gap-2 hover:border-primary/40 transition-colors"
                  >
                    <Image
                      src={`/images/protocols/${p}_round.svg`}
                      alt={p}
                      width={32}
                      height={32}
                    />
                    <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                      {p}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-6 py-20">
          <div className="mb-10 pb-4 border-b border-border">
            <span className="ship-mark">how it works</span>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-paper mt-3">
              HTTP 402 → pay → run
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Stage index="01" label="agent pays">
              The Calypso <span className="text-primary">Agent</span> signs two
              real x402 payments — $0.01 for <code>/plan</code> and $0.05 for{" "}
              <code>/simulate</code> — with its own Ed25519 keypair. You watch,
              you don&apos;t sign.
            </Stage>
            <Stage index="02" label="bots deploy">
              The agent spawns ephemeral bot wallets (EOA + Hoops smart account
              per bot), funds them with USDC, and kicks off rule-based chassis
              loops that route through the Hoops router.
            </Stage>
            <Stage index="03" label="watch &amp; stop">
              SSE streams every bot action to the session page. Gemini Flash reviews
              metrics every 5 minutes and pushes parameter deltas back. Hit STOP
              to abort and drain bot funds back to the agent.
            </Stage>
          </div>
        </div>
      </section>
    </div>
  );
}

function PriceRow({ method, path, price }: { method: string; path: string; price: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2">
        <span className="method-badge method-POST">{method}</span>
        <span className="text-foreground">{path}</span>
      </div>
      <span className="text-primary font-semibold tabular-nums">{price}</span>
    </div>
  );
}

function Stage({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative border border-border bg-card/40 p-6 corner-marks">
      <div className="flex items-baseline gap-3 mb-4">
        <div className="font-display text-5xl font-semibold text-primary leading-none tabular-nums">
          {index}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
