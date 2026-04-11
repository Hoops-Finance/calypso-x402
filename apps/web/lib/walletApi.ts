"use client";

/**
 * walletApi.ts — typed fetchers for the wallet inspection endpoints.
 * All routes are free (no x402).
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:9990";

export interface RawBalances {
  xlm: string; // bigint string, 7 decimals
  usdc: string;
}

export interface PlatformWallet {
  label: string;
  role: "orchestrator";
  address: string;
  network: string;
  balances: RawBalances;
}

export interface AddressBalance {
  address: string;
  balances: RawBalances;
}

export interface SessionBotWallet {
  bot_id: string;
  archetype: string;
  eoa: { address: string; balances: RawBalances };
  smart_account: { address: string; balances: RawBalances };
}

export interface SessionWalletsResponse {
  session_id: string;
  session_name: string;
  status: string;
  bots: SessionBotWallet[];
}

export const walletApi = {
  platform: async (): Promise<PlatformWallet> => {
    const res = await fetch(`${API_BASE}/wallets/platform`);
    if (!res.ok) throw new Error(`platform wallet ${res.status}`);
    return (await res.json()) as PlatformWallet;
  },
  byAddress: async (address: string): Promise<AddressBalance> => {
    const res = await fetch(
      `${API_BASE}/wallets/balance?address=${encodeURIComponent(address)}`,
    );
    if (!res.ok) throw new Error(`balance ${res.status}`);
    return (await res.json()) as AddressBalance;
  },
  session: async (sessionId: string): Promise<SessionWalletsResponse> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/wallets`);
    if (!res.ok) throw new Error(`session wallets ${res.status}`);
    return (await res.json()) as SessionWalletsResponse;
  },
  topUp: async (
    usdcAmount: number,
  ): Promise<{ ok: true; balances: RawBalances } | { ok: false; error: string }> => {
    const res = await fetch(`${API_BASE}/wallets/platform/topup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usdc_amount: usdcAmount }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { balances: RawBalances };
    return { ok: true, balances: data.balances };
  },
  mintUsdcToAddress: async (
    address: string,
    usdcAmount: number,
  ): Promise<{ ok: true; tx: string } | { ok: false; error: string }> => {
    const res = await fetch(`${API_BASE}/admin/mint-usdc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, usdc_amount: usdcAmount }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { tx: string };
    return { ok: true, tx: data.tx };
  },
};

/**
 * Converts a 7-decimal Stellar stroop string to a human-friendly display
 * ("12.34" or "—" if zero).
 */
export function fmtStroops(raw: string | undefined): string {
  if (!raw) return "—";
  try {
    const n = BigInt(raw);
    const ZERO = BigInt(0);
    const DECIMALS = BigInt(10_000_000);
    if (n === ZERO) return "0.00";
    const whole = n / DECIMALS;
    const frac = n % DECIMALS;
    const fracStr = frac.toString().padStart(7, "0").slice(0, 2);
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return raw;
  }
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
