"use client";

/**
 * WalletProvider — minimal Freighter-only wallet context.
 *
 * No StellarWalletsKit, no WalletConnect, no multi-wallet modal. A single
 * browser extension (Freighter), a single network (testnet), a single
 * signing flow. If Freighter isn't installed we surface an install CTA.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  requestAccess as freighterRequestAccess,
  getAddress as freighterGetAddress,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export interface WalletState {
  installed: boolean;
  connected: boolean;
  address: string | null;
  error: string | null;
  loading: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signXdr: (xdr: string) => Promise<string>;
  fundFromFriendbot: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const connCheck = await freighterIsConnected();
      const isInstalled = !connCheck.error;
      setInstalled(isInstalled);
      if (!isInstalled) {
        setConnected(false);
        setAddress(null);
        return;
      }
      const allowed = await freighterIsAllowed();
      if (allowed.error || !allowed.isAllowed) {
        setConnected(false);
        setAddress(null);
        return;
      }
      const addr = await freighterGetAddress();
      if (addr.error || !addr.address) {
        setConnected(false);
        setAddress(null);
        return;
      }
      setAddress(addr.address);
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const access = await freighterRequestAccess();
      if (access.error) throw new Error(access.error);
      if (!access.address) throw new Error("Freighter did not return an address");
      setAddress(access.address);
      setConnected(true);
      setInstalled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setAddress(null);
  }, []);

  const signXdr = useCallback(
    async (xdr: string): Promise<string> => {
      if (!address) throw new Error("wallet not connected");
      const result = await freighterSignTransaction(xdr, {
        networkPassphrase: TESTNET_PASSPHRASE,
        address,
      });
      if (result.error) throw new Error(result.error);
      if (!result.signedTxXdr) throw new Error("Freighter returned no signed xdr");
      return result.signedTxXdr;
    },
    [address],
  );

  const fundFromFriendbot = useCallback(async () => {
    if (!address) return { ok: false as const, error: "wallet not connected" };
    try {
      const res = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // Friendbot returns 400 if the account is already funded — surface
        // that as a friendly message rather than a scary error.
        if (res.status === 400 && body.includes("createAccountAlreadyExist")) {
          return { ok: false as const, error: "already funded" };
        }
        return { ok: false as const, error: `friendbot ${res.status}` };
      }
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [address]);

  const value: WalletState = useMemo(
    () => ({
      installed,
      connected,
      address,
      error,
      loading,
      connect,
      disconnect,
      signXdr,
      fundFromFriendbot,
    }),
    [installed, connected, address, error, loading, connect, disconnect, signXdr, fundFromFriendbot],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
