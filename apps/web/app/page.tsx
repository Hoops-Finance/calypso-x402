import Link from "next/link";
import Image from "next/image";
import { Button, Card, Badge, MetricCard } from "../components/ui";

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
      {/* Hero */}
      <section className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto">
        <Badge tone="primary">x402 · Stripe MPP · Stellar</Badge>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          Market environments are a{" "}
          <span className="text-primary">paid API</span>.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Calypso Swarm turns Stellar DeFi market simulation into a pay-per-call
          capability. Agents pay USDC via x402 to spin up rule-based bot swarms
          that trade real Hoops router paths across Soroswap, Phoenix, Comet,
          and Aquarius — and a Gemma 4 orchestrator retunes them live.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Link href="/simulate">
            <Button>run a simulation →</Button>
          </Link>
          <a
            href="https://github.com/Hoops-Finance/calypso-x402"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="secondary">source</Button>
          </a>
        </div>
      </section>

      {/* Price card strip */}
      <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="/plan" value="$0.50" sublabel="Gemma-generated session config" tone="primary" />
        <MetricCard label="/simulate" value="$2.00" sublabel="Live bot swarm on testnet" tone="primary" />
        <MetricCard label="/analyze" value="$0.50" sublabel="On-chain health snapshot" tone="primary" />
      </section>

      {/* How it works */}
      <section className="mt-20">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-bold">How it works</h2>
          <span className="text-xs text-muted-foreground uppercase tracking-widest">
            HTTP 402 → pay → run
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="text-primary text-xs font-bold tracking-[0.2em]">01 · PLAN</div>
            <h3 className="mt-3 text-lg font-semibold">
              Ask for a market in plain English
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              POST <code className="text-primary">/plan</code> with a prompt like
              &quot;stress-test USDC/XLM liquidity across Soroswap and Phoenix
              for 10 minutes&quot;. Gemma 4 returns a validated SessionConfig
              and bot recipe.
            </p>
          </Card>
          <Card>
            <div className="text-primary text-xs font-bold tracking-[0.2em]">02 · SIMULATE</div>
            <h3 className="mt-3 text-lg font-semibold">
              Pay $2.00 USDC, get a running market
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              POST <code className="text-primary">/simulate</code> returns{" "}
              <code>HTTP 402</code>. Freighter signs a USDC transfer to the
              API&apos;s receiver. Within seconds, bot wallets are deployed and
              trading via the Hoops router.
            </p>
          </Card>
          <Card>
            <div className="text-primary text-xs font-bold tracking-[0.2em]">03 · WATCH</div>
            <h3 className="mt-3 text-lg font-semibold">
              Live tail the swarm, watch the AI retune
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              A SSE stream feeds every bot action to{" "}
              <code className="text-primary">/sessions/[id]</code>. Every five
              minutes Gemma 4 reviews the aggregated metrics and pushes
              parameter deltas back to the swarm.
            </p>
          </Card>
        </div>
      </section>

      {/* Venues */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold mb-6">Routes through the Hoops router</h2>
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 items-center">
            {["soroswap", "phoenix", "aqua", "blend", "hoops"].map((p) => (
              <div
                key={p}
                className="flex flex-col items-center gap-2 opacity-80 hover:opacity-100 transition-opacity"
              >
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <Image
                    src={`/images/protocols/${p}_round.svg`}
                    alt={p}
                    width={40}
                    height={40}
                  />
                </div>
                <span className="text-xs text-muted-foreground capitalize">{p}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
