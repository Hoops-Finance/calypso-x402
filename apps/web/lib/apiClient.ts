"use client";

/**
 * apiClient.ts — typed fetchers for the Calypso API.
 *
 * For the hackathon we do NOT route paid endpoints through @x402/fetch
 * from the browser — the x402 client-side signing flow for Stellar is
 * still in flux and would block the UI demo. Instead, we expose the paid
 * routes as ungated "demo" variants that the backend can honor when
 * X402_DEMO_MODE is set, OR we hit a server-side proxy. For now we hit
 * the paid endpoints directly and surface the 402 response to the user
 * as a "paywall" modal in dev mode, and the server's facilitator
 * attempts settlement when the payment header arrives.
 *
 * This keeps the video demo flow reliable: the /simulate button shows a
 * visible "paying $2.00 via x402" step even when the real settlement is
 * bypassed in dev.
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

const API_BASE =
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

export class PaymentRequiredError extends Error {
  constructor(public path: string, public paymentHeader: string) {
    super(`402 Payment Required for ${path}`);
    this.name = "PaymentRequiredError";
  }
}

export const api = {
  health: () => jsonFetch<{ ok: boolean; pay_to: string; network: string }>("/health"),
  listSessions: () => jsonFetch<{ sessions: SessionSummary[] }>("/sessions"),
  getReport: (id: string) => jsonFetch<Report>(`/report/${id}`),
  plan: (req: PlanRequest) =>
    jsonFetch<PlanResponse>("/plan", { method: "POST", body: JSON.stringify(req) }),
  simulate: (req: SimulateRequest) =>
    jsonFetch<SimulateResponse>("/simulate", { method: "POST", body: JSON.stringify(req) }),
  analyze: (req: AnalyzeRequest) =>
    jsonFetch<AnalyzeResponse>("/analyze", { method: "POST", body: JSON.stringify(req) }),
};

export function openEventStream(sessionId: string): EventSource {
  return new EventSource(`${API_BASE}/events/${sessionId}`);
}
