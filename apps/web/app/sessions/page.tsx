"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionSummary } from "@calypso/shared";
import { Button, Card, Badge } from "../../components/ui";
import { agent } from "../../lib/apiClient";

export default function SessionsIndex() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const res = await agent.listSessions();
        setSessions(res.sessions);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
    timer = setInterval(() => void load(), 3000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">sessions</h1>
          <p className="mt-2 text-muted-foreground">
            Every Calypso session you&apos;ve launched. Polls every 3s.
          </p>
        </div>
        <Link href="/simulate">
          <Button>new session →</Button>
        </Link>
      </div>

      {loading && <Card>loading…</Card>}
      {error && (
        <Card className="border-destructive/40">
          <div className="text-sm text-destructive">api error: {error}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Is the API running on http://localhost:9990?
          </div>
        </Card>
      )}
      {!loading && sessions.length === 0 && !error && (
        <Card>
          <div className="text-muted-foreground">
            no sessions yet.{" "}
            <Link href="/simulate" className="text-primary hover:underline">
              launch one
            </Link>
            .
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <Link key={s.session_id} href={`/sessions/${s.session_id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <div className="font-semibold text-lg">{s.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {s.session_id}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={s.status === "running" ? "success" : s.status === "failed" ? "danger" : "default"}>
                    {s.status}
                  </Badge>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">volume</div>
                    <div className="font-mono text-sm">
                      {s.pnl_summary.gross_volume_usd.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
