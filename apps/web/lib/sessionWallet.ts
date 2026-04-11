"use client";

/**
 * sessionWallet.ts — browser-side throwaway Stellar keypair used to pay
 * x402-gated Calypso endpoints.
 *
 * This is intentionally NOT the user's Freighter wallet. Instead, on
 * first visit we create a fresh Stellar Ed25519 keypair, persist its
 * secret in localStorage, friendbot it to create the account, and then
 * mint test USDC to it via Calypso's admin endpoint. Every x402 call
 * from the browser signs with this keypair. The facilitator settles the
 * payment on-chain for real — no demo-mode bypass.
 *
 * Why a throwaway instead of Freighter?
 *   1. Freighter's browser-side Soroban signing for x402 auth entries
 *      isn't a stable path yet for third-party dapps.
 *   2. Autonomous agents would have their own agent wallet too — this
 *      mirrors the real production pattern, not the other way around.
 *   3. Having a dedicated "session wallet" makes the demo narrative
 *      clean: the user funds a wallet, that wallet pays for simulation,
 *      whatever's left can be reclaimed.
 */

import { Keypair } from "@stellar/stellar-sdk";

const STORAGE_KEY = "calypso.sessionWallet.secret.v1";

export interface SessionWalletState {
  publicKey: string;
  secret: string;
}

/**
 * Returns the existing session wallet or creates a new one. Persistent
 * across page loads via localStorage. Only accessible on the client.
 */
export function loadOrCreateSessionWallet(): SessionWalletState {
  if (typeof window === "undefined") {
    throw new Error("sessionWallet is client-only");
  }
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      const kp = Keypair.fromSecret(existing);
      return { publicKey: kp.publicKey(), secret: existing };
    } catch {
      // Corrupt entry — regenerate below.
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  const kp = Keypair.random();
  const secret = kp.secret();
  window.localStorage.setItem(STORAGE_KEY, secret);
  return { publicKey: kp.publicKey(), secret };
}

/** Wipes the persisted session wallet. */
export function clearSessionWallet(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
