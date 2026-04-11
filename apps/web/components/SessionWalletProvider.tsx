"use client";

/**
 * SessionWalletProvider — holds the browser's throwaway Stellar keypair
 * used for x402 payments, and auto-funds it (friendbot XLM + admin USDC
 * mint) on first load so any gated call is ready to pay immediately.
 *
 * The keypair is persistent via localStorage, so it survives refreshes.
 * Balances are polled every 6s.
 *
 * Because this component is rendered inside the App Router server pass
 * on initial load (even with "use client"), we must not touch
 * localStorage until we're mounted. Wallet creation happens in a
 * useEffect on the client, and downstream consumers handle the
 * transitional "no wallet yet" state gracefully.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadOrCreateSessionWallet, clearSessionWallet } from "../lib/sessionWallet";
import { walletApi, type RawBalances } from "../lib/walletApi";
import { buildPaidFetch } from "../lib/x402Client";

const MIN_XLM_STROOPS = BigInt(5_000_000_000); // 500 XLM — min we consider "funded"
const MIN_USDC_STROOPS = BigInt(50_000_000); // 5 USDC — min we consider "ready to pay"
const TARGET_USDC_MINT = 25; // mint this much USDC to the session wallet on first load

export interface SessionWalletCtx {
  publicKey: string;
  secret: string;
  balances: RawBalances | null;
  status: "loading" | "funding" | "ready" | "error";
  error: string | null;
  paidFetch: typeof fetch;
  refresh: () => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<SessionWalletCtx | null>(null);

async function friendbotFund(addr: string): Promise<void> {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(addr)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /already/i.test(body)) return;
    throw new Error(`friendbot ${res.status}`);
  }
}

const NOOP_FETCH: typeof fetch = async () => {
  throw new Error("session wallet not yet initialized");
};

export function SessionWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<{ publicKey: string; secret: string } | null>(null);
  const [balances, setBalances] = useState<RawBalances | null>(null);
  const [status, setStatus] = useState<SessionWalletCtx["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  const paidFetchRef = useRef<typeof fetch>(NOOP_FETCH);

  // Client-only initialization. Runs after mount, so localStorage is safe.
  useEffect(() => {
    if (wallet) return;
    try {
      const next = loadOrCreateSessionWallet();
      paidFetchRef.current = buildPaidFetch(next.secret);
      setWallet(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [wallet]);

  const readBalances = useCallback(async () => {
    if (!wallet) return null;
    try {
      const res = await walletApi.byAddress(wallet.publicKey);
      setBalances(res.balances);
      return res.balances;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [wallet]);

  const fundIfNeeded = useCallback(
    async (current: RawBalances | null) => {
      if (!wallet || !current) return;
      const xlm = BigInt(current.xlm ?? "0");
      const usdc = BigInt(current.usdc ?? "0");

      if (xlm < MIN_XLM_STROOPS) {
        setStatus("funding");
        try {
          await friendbotFund(wallet.publicKey);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }

      if (usdc < MIN_USDC_STROOPS) {
        setStatus("funding");
        const result = await walletApi.mintUsdcToAddress(wallet.publicKey, TARGET_USDC_MINT);
        if (!result.ok) {
          setError(result.error);
        }
      }
    },
    [wallet],
  );

  const refresh = useCallback(async () => {
    const bals = await readBalances();
    await fundIfNeeded(bals);
    const after = await readBalances();
    if (after) {
      const xlm = BigInt(after.xlm ?? "0");
      const usdc = BigInt(after.usdc ?? "0");
      if (xlm >= MIN_XLM_STROOPS && usdc >= MIN_USDC_STROOPS) {
        setStatus("ready");
        setError(null);
      }
    }
  }, [readBalances, fundIfNeeded]);

  const reset = useCallback(() => {
    clearSessionWallet();
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  useEffect(() => {
    if (!wallet) return;
    void refresh();
    const timer = setInterval(() => void readBalances(), 6000);
    return () => clearInterval(timer);
  }, [wallet, refresh, readBalances]);

  const value: SessionWalletCtx = useMemo(
    () => ({
      publicKey: wallet?.publicKey ?? "",
      secret: wallet?.secret ?? "",
      balances,
      status,
      error,
      paidFetch: paidFetchRef.current,
      refresh,
      reset,
    }),
    [wallet, balances, status, error, refresh, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionWallet(): SessionWalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSessionWallet must be used inside <SessionWalletProvider>");
  return ctx;
}
