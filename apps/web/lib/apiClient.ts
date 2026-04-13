"use client";

/**
 * apiClient.ts — typed fetchers for the Calypso API.
 *
 * The UI is a pure harness. It does NOT sign x402 payments. Every
 * paid call goes through /agent/* routes — the Calypso Agent is the
 * autonomous economic actor and it signs every x402 payment with its
 * own Ed25519 keypair over real localhost HTTP to the facilitator.
 *
 * Shapes:
 *   agent.status()       — GET  /agent
 *   agent.balance()      — GET  /agent/balance
 *   agent.withdraw()     — POST /agent/withdraw
 *   agent.simulate()     — POST /agent/simulate      (returns traces)
 *   agent.stop(id)       — POST /agent/stop/:id
 *   agent.listSessions() — GET  /agent/sessions
 *   agent.getReport(id)  — GET  /agent/session/:id
 *   agent.openEvents(id) — SSE  /agent/session/:id/events
 *
 * Free reads:
 *   wallets.platform()   — API revenue wallet
 *   wallets.byAddress()  — arbitrary Stellar address balance
 *   admin.mintUsdc()     — testnet admin mint faucet
 */

import type {
  Report,
  SessionSummary,
  AIFeedbackEntry,
  BotLogEntry,
  BotConfig,
  SessionStatus,
} from "@calypso/shared";

/**
 * Super-type returned by /agent/session/:id — the base Report fields plus
 * session name, editable bot configs, and per-bot wallet addresses.
 */
export interface AgentReport extends Report {
  name: string;
  bot_configs: BotConfig[];
  bots: Array<{
    bot_id: string;
    eoa: string;
    smart_account: string;
  }>;
  plan_trace?: X402Trace | null;
  simulate_trace?: X402Trace | null;
}

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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared types that mirror the Agent's trace shape
// ─────────────────────────────────────────────────────────────────────────────

export interface X402Trace {
  path: string;
  method: "POST";
  payer: string;
  payee: string;
  amount: string | null;
  amount_usd: string | null;
  asset: string | null;
  network: string;
  payment_required_raw: string | null;
  payment_required_decoded: unknown;
  payment_tx_hash: string | null;
  settled_at: string;
}

export interface RawBalances {
  xlm: string;
  usdc: string;
  xlm_human?: string;
  usdc_human?: string;
}

export interface AgentStatus {
  address: string;
  network: string;
  ready: boolean;
  balances: RawBalances;
  sessions: number;
}

export interface AgentSimulateResponse {
  session_id: string;
  status: SessionStatus;
  started_at: string;
  plan_trace: X402Trace;
  simulate_trace: X402Trace;
  ai_reasoning: string | null;
  ai_model: string;
}

export interface AgentLaunchResponse {
  session_id: string;
  status: SessionStatus;
  started_at: string;
  simulate_trace: X402Trace;
}

export interface AgentStopResponse {
  session_id: string;
  status: SessionStatus;
  teardown: {
    session_id: string;
    recovered: { xlm: string; usdc: string };
    per_bot: Array<{
      bot_id: string;
      xlm_sent: string;
      usdc_sent: string;
      xlm_tx?: string;
      usdc_tx?: string;
      error?: string;
    }>;
  };
}

export interface AgentWithdrawResponse {
  ok: true;
  tx: string;
  amount_usdc: number;
  recipient: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent — the UI's remote control surface
// ─────────────────────────────────────────────────────────────────────────────

export const agent = {
  status: () => jsonFetch<AgentStatus>("/agent"),
  balance: () => jsonFetch<{ address: string; balances: RawBalances }>("/agent/balance"),
  withdraw: (to: string, usdcAmount: number) =>
    jsonFetch<AgentWithdrawResponse>("/agent/withdraw", {
      method: "POST",
      body: JSON.stringify({ to, amount: usdcAmount }),
    }),
  simulate: (prompt: string) =>
    jsonFetch<AgentSimulateResponse>("/agent/simulate", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  stop: (sessionId: string) =>
    jsonFetch<AgentStopResponse>(`/agent/stop/${sessionId}`, { method: "POST" }),
  launch: (sessionConfig: Record<string, unknown>, botConfigs: Record<string, unknown>[]) =>
    jsonFetch<AgentLaunchResponse>("/agent/launch", {
      method: "POST",
      body: JSON.stringify({ session_config: sessionConfig, bot_configs: botConfigs }),
    }),
  listSessions: () => jsonFetch<{ sessions: SessionSummary[] }>("/agent/sessions"),
  getReport: (sessionId: string) => jsonFetch<AgentReport>(`/agent/session/${sessionId}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// Free wallet reads (unauthenticated, no x402)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformWallet {
  label: string;
  role: string;
  address: string;
  smart_account: string;
  network: string;
  balances: RawBalances;
  eoa_balances?: RawBalances;
  smart_balances?: RawBalances;
}

export interface AddressBalance {
  address: string;
  balances: RawBalances;
}

export const wallets = {
  platform: () => jsonFetch<PlatformWallet>("/wallets/platform"),
  byAddress: (address: string) =>
    jsonFetch<AddressBalance>(`/wallets/balance?address=${encodeURIComponent(address)}`),
};

export const admin = {
  mintUsdc: (address: string, usdcAmount: number) =>
    jsonFetch<{ ok: true; tx: string; address: string; amount_usdc: number }>(
      "/admin/mint-usdc",
      {
        method: "POST",
        body: JSON.stringify({ address, usdc_amount: usdcAmount }),
      },
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// User-signed tx flow — browser builds/signs/submits via server helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltTxEnvelope {
  xdr: string;
  network_passphrase: string;
  from: string;
  to: string;
  amount_usdc: number;
}

export const tx = {
  buildFundAgent: (fromAddress: string, usdcAmount: number) =>
    jsonFetch<BuiltTxEnvelope>("/tx/build-fund-agent", {
      method: "POST",
      body: JSON.stringify({ from: fromAddress, usdc_amount: usdcAmount }),
    }),
  submit: (signedXdr: string) =>
    jsonFetch<{ ok: true; hash: string; ledger: number | null }>("/tx/submit", {
      method: "POST",
      body: JSON.stringify({ signed_xdr: signedXdr }),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Streaming simulate (NDJSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulateProgressEvent {
  step: string;
  message: string;
  t: number;
  tx?: string | null;
  model?: string;
  reasoning?: string | null;
  // "result" step carries the full response
  session_id?: string;
  plan_trace?: X402Trace;
  simulate_trace?: X402Trace;
  ai_reasoning?: string | null;
  ai_model?: string;
}

export interface PlanStreamResult {
  plan: {
    session_config: Record<string, unknown>;
    bot_configs: Record<string, unknown>[];
    estimated_cost_usd: number;
    target_pools: string[];
  };
  trace: X402Trace;
  reasoning: string | null;
  model: string;
}

export async function planStream(
  prompt: string,
  onEvent: (event: SimulateProgressEvent) => void,
): Promise<PlanStreamResult> {
  const res = await fetch(`${API_BASE}/agent/plan-stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`plan-stream ${res.status}: ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: PlanStreamResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as SimulateProgressEvent & { plan?: unknown };
        onEvent(evt);
        if (evt.step === "result" && evt.plan) {
          finalResult = evt as unknown as PlanStreamResult;
        }
        if (evt.step === "error") throw new Error(evt.message);
      } catch (err) {
        if (err instanceof Error && err.message !== line) throw err;
      }
    }
  }

  if (!finalResult) throw new Error("plan stream ended without result");
  return finalResult;
}

export async function simulateStream(
  prompt: string,
  onEvent: (event: SimulateProgressEvent) => void,
): Promise<AgentSimulateResponse> {
  const res = await fetch(`${API_BASE}/agent/simulate-stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`simulate-stream ${res.status}: ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AgentSimulateResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as SimulateProgressEvent;
        onEvent(evt);
        if (evt.step === "result" && evt.session_id) {
          finalResult = evt as unknown as AgentSimulateResponse;
        }
        if (evt.step === "error") {
          throw new Error(evt.message);
        }
      } catch (err) {
        if (err instanceof Error && err.message !== line) throw err;
      }
    }
  }

  if (!finalResult) throw new Error("stream ended without result");
  return finalResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE
// ─────────────────────────────────────────────────────────────────────────────

export function openAgentEventStream(sessionId: string): EventSource {
  return new EventSource(`${API_BASE}/agent/session/${sessionId}/events`);
}

export type IncomingSessionEvent =
  | { type: "bot_action"; entry: BotLogEntry }
  | { type: "ai_review"; entry: AIFeedbackEntry }
  | { type: "status"; status: SessionStatus };

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

export function fmtStroops(raw: string | undefined | null): string {
  if (!raw) return "—";
  try {
    const n = BigInt(raw);
    if (n === BigInt(0)) return "0.00";
    const DECIMALS = BigInt(10_000_000);
    const whole = n / DECIMALS;
    const frac = n % DECIMALS;
    const fracStr = frac.toString().padStart(7, "0").slice(0, 2);
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return String(raw);
  }
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function shortHash(h: string | null | undefined): string {
  if (!h) return "—";
  if (h.length < 14) return h;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export const STELLAR_EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx";
export const STELLAR_EXPLORER_ACCOUNT = "https://stellar.expert/explorer/testnet/account";

export function txExplorerUrl(hash: string): string {
  return `${STELLAR_EXPLORER_TX}/${hash}`;
}
export function accountExplorerUrl(address: string): string {
  return `${STELLAR_EXPLORER_ACCOUNT}/${address}`;
}
