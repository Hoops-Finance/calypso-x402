"use client";

/**
 * apiClient.ts — typed fetchers for the Calypso API.
 *
 * Two flavors:
 *   - `api.*` — unauthenticated, used for GET requests (sessions, report, wallets)
 *   - `buildPaidApi(paidFetch)` — returns a bound API that uses the x402
 *     paid-fetch wrapper from the session wallet provider for gated
 *     POSTs (/plan, /simulate, /analyze). Every call settles on-chain.
 *
 * Callers inside React components should import `useSessionWallet` and
 * use `buildPaidApi(ctx.paidFetch)` rather than `api` directly for any
 * gated route.
 */

import type {
  PlanRequest,
  PlanResponse,
  SimulateRequest,
  SimulateResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  Report,
  SessionSummary,
} from "@calypso/shared";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:9990";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 402) {
    const payload = res.headers.get("PAYMENT-REQUIRED") ?? "";
    throw new PaymentRequiredError(path, payload);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function paidJsonFetch<T>(
  paidFetch: typeof fetch,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await paidFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 402) {
    const payload = res.headers.get("PAYMENT-REQUIRED") ?? "";
    throw new PaymentRequiredError(path, payload);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export class PaymentRequiredError extends Error {
  constructor(
    public path: string,
    public paymentHeader: string,
  ) {
    super(`402 Payment Required for ${path}`);
    this.name = "PaymentRequiredError";
  }
}

/** Unauthenticated API — free endpoints only. */
export const api = {
  health: () => jsonFetch<{ ok: boolean; pay_to: string; network: string }>("/health"),
  listSessions: () => jsonFetch<{ sessions: SessionSummary[] }>("/sessions"),
  getReport: (id: string) => jsonFetch<Report>(`/report/${id}`),

  /** Stop a running session. Backend endpoint is scaffolded in Task backend-stop. */
  stopSession: (id: string) =>
    jsonFetch<{ session_id: string; status: string; stopped_at: string }>(
      `/sessions/${id}/stop`,
      { method: "POST" },
    ),

  /** Teardown a completed session (return bot funds to orchestrator). */
  teardownSession: (id: string) =>
    jsonFetch<{ session_id: string; recovered: { xlm: string; usdc: string } }>(
      `/sessions/${id}/teardown`,
      { method: "POST" },
    ),

  /** Withdraw orchestrator USDC back to any Stellar address. Demo-mode only. */
  withdrawFromOrchestrator: (to: string, usdcAmount: number) =>
    jsonFetch<{ ok: true; tx: string; amount_usdc: number }>(
      `/wallets/platform/withdraw`,
      {
        method: "POST",
        body: JSON.stringify({ to, usdc_amount: usdcAmount }),
      },
    ),
};

/**
 * Builds the paid API binding against a specific paidFetch wrapper
 * (from SessionWalletProvider). Gated endpoints only.
 */
export function buildPaidApi(paidFetch: typeof fetch) {
  return {
    plan: (req: PlanRequest) =>
      paidJsonFetch<PlanResponse>(paidFetch, "/plan", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    simulate: (req: SimulateRequest) =>
      paidJsonFetch<SimulateResponse>(paidFetch, "/simulate", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    analyze: (req: AnalyzeRequest) =>
      paidJsonFetch<AnalyzeResponse>(paidFetch, "/analyze", {
        method: "POST",
        body: JSON.stringify(req),
      }),
  };
}

export function openEventStream(sessionId: string): EventSource {
  return new EventSource(`${API_BASE}/events/${sessionId}`);
}
