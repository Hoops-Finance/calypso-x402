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
        {/* Oversized decorative logo silhouette behind the hero text */}
        <div
          className="absolute pointer-events-none opacity-[0.07]"
          style={{
            right: "-120px",
            top: "40px",
            width: "720px",
            height: "720px",
            filter: "blur(0.5px)",
          }}
          aria-hidden
        >
          <Image
            src="/images/calypso-logo.svg"
            alt=""
            width={720}
            height={720}
          />
        </div>
        <div className="relative max-w-[1280px] mx-auto px-6 py-24 md:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-4 mb-6">
                <div
                  className="relative w-16 h-16 shrink-0"
                  style={{
                    filter: "drop-shadow(0 0 18px hsl(var(--primary) / 0.4))",
                  }}
                >
                  <Image
                    src="/images/calypso-logo.svg"
                    alt="Calypso"
                    width={64}
                    height={64}
                    priority
                  />
                </div>
                <div className="h-px flex-1 bg-border" />
                <span className="ship-mark">stellar · x402 · stripe mpp</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  hackathon · 2026-04-13
                </span>
              </div>
              <h1 className="font-display text-[clamp(3rem,8vw,7.5rem)] leading-[0.88] font-semibold text-paper tracking-tight">
                Market
                <br />
                <span className="text-primary">environments</span>
                <br />
                are a <em className="font-display italic">paid API</em>.
              </h1>
              <p className="mt-8 max-w-[580px] text-lg text-muted-foreground leading-relaxed">
                Calypso Swarm turns Stellar DeFi market simulation into a
                pay-per-call capability. Autonomous agents pay USDC via x402 to
                spin up rule-based bot swarms that trade real Hoops router paths
                across Soroswap, Phoenix, Aqua, Comet — and a Gemma 4 orchestrator
                retunes them live.
              </p>
              <div className="mt-10 flex items-center gap-3">
                <Link
                  href="/simulate"
                  className="group relative inline-flex items-center gap-3 px-7 py-5 border-2 border-primary bg-primary hover:bg-primary/90 transition-colors"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-primary-foreground">
                    run a simulation →
                  </span>
                </Link>
                <Link
                  href="/wallets"
                  className="inline-flex items-center px-7 py-5 border-2 border-border hover:border-foreground/40 transition-colors"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-foreground">
                    wallet hierarchy
                  </span>
                </Link>
              </div>
            </div>

            {/* Right rail — pricing card */}
            <div className="lg:col-span-4">
              <div className="relative border border-border-strong bg-card/60 backdrop-blur corner-marks">
                <div className="hazard-stripes h-1 w-full" aria-hidden />
                <div className="p-5">
                  <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                    published fees · x402 gated
                  </div>
                  <div className="space-y-1 font-mono text-xs">
                    <PriceRow method="POST" path="/plan" price="$0.50" />
                    <PriceRow method="POST" path="/simulate" price="$2.00" />
                    <PriceRow method="POST" path="/analyze" price="$0.50" />
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                      facilitator
                    </div>
                    <div className="font-mono text-[10px] text-foreground mt-0.5 break-all">
                      www.x402.org/facilitator
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-6 py-20">
          <div className="flex items-end justify-between mb-10 pb-4 border-b border-border">
            <div>
              <span className="ship-mark">how it works</span>
              <h2 className="font-display text-4xl md:text-5xl font-semibold text-paper mt-3">
                HTTP 402 → pay → run
              </h2>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              three stages
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Stage index="01" label="plan">
              POST <code className="text-primary">/plan</code> with a natural
              language brief. Gemma 4 returns a validated SessionConfig and bot
              recipe. First x402 payment ($0.50 USDC) runs the planner.
            </Stage>
            <Stage index="02" label="simulate">
              POST <code className="text-primary">/simulate</code> returns{" "}
              <code>HTTP 402</code>. Your session wallet signs a Stellar Soroban
              auth entry. Facilitator settles on-chain. Bot smart accounts
              deploy and start trading via the Hoops router.
            </Stage>
            <Stage index="03" label="watch">
              SSE stream feeds every bot action to the session page. Every five
              minutes Gemma reviews the aggregated metrics and pushes parameter
              deltas back to the swarm. Real trades on stellar.expert.
            </Stage>
          </div>
        </div>
      </section>

      {/* VENUES */}
      <section className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="ship-mark">venues</span>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-paper mt-3">
                Routed through the Hoops router
              </h2>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              stellar testnet
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {["soroswap", "phoenix", "aqua", "blend", "hoops"].map((p) => (
              <div
                key={p}
                className="relative border border-border bg-card/40 p-5 flex flex-col items-center gap-3 hover:border-primary/40 transition-colors"
              >
                <Image
                  src={`/images/protocols/${p}_round.svg`}
                  alt={p}
                  width={44}
                  height={44}
                />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {p}
                </div>
              </div>
            ))}
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
