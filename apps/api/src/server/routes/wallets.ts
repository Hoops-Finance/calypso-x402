/**
 * wallets.ts — read-only wallet inspection endpoints.
 *
 *   GET /wallets/platform         → PAY_TO wallet + its XLM/USDC balance
 *   GET /wallets/balance          → any Stellar address balance
 *   POST /admin/mint-usdc         → testnet USDC faucet (demo only)
 *
 * Free routes: the UI polls them on a ~3s cadence to keep the wallet
 * hierarchy view live. No x402, no rate limit — these are just RPC
 * balance reads and are safe to hammer.
 */

import type { Request, Response } from "express";
import { TokenContract, createRpcClientForNetwork } from "hoops-sdk-core";
import {
  TOKENS,
  NETWORK_PASSPHRASE,
  HOOPS_NETWORK,
} from "../../constants.js";
import { ENV } from "../../env.js";
import { PlatformWallet } from "../../orchestrator/platformWallet.js";
import { logger } from "../../logger.js";

const rpc = createRpcClientForNetwork(HOOPS_NETWORK);
const xlmToken = new TokenContract(TOKENS.xlm, rpc, NETWORK_PASSPHRASE);
const usdcToken = new TokenContract(TOKENS.usdc, rpc, NETWORK_PASSPHRASE);

async function readBalances(caller: string, addr: string): Promise<{ xlm: string; usdc: string }> {
  try {
    const [xlm, usdc] = await Promise.all([
      xlmToken.balance(caller, addr),
      usdcToken.balance(caller, addr),
    ]);
    return { xlm: xlm.toString(), usdc: usdc.toString() };
  } catch (err) {
    logger.warn({ err, addr }, "wallet balance read failed");
    return { xlm: "0", usdc: "0" };
  }
}

export async function handlePlatformWallet(_req: Request, res: Response): Promise<void> {
  const addr = ENV.PAY_TO;
  const platform = PlatformWallet.get();
  const smartAccountId = platform.state.smartAccountId;

  // Read EOA balances and smart-account balances in parallel, then sum
  // for the headline view. The UI cares about total USDC available to
  // seed bots; the split between EOA and smart account is implementation.
  const [eoa, smart] = await Promise.all([
    readBalances(addr, addr),
    smartAccountId
      ? readBalances(addr, smartAccountId)
      : Promise.resolve({ xlm: "0", usdc: "0" }),
  ]);

  const totalXlm = (BigInt(eoa.xlm) + BigInt(smart.xlm)).toString();
  const totalUsdc = (BigInt(eoa.usdc) + BigInt(smart.usdc)).toString();

  res.json({
    label: "Calypso Orchestrator",
    role: "orchestrator",
    address: addr,
    smart_account: smartAccountId,
    network: ENV.X402_NETWORK,
    initialized: platform.state.initialized,
    balances: { xlm: totalXlm, usdc: totalUsdc },
    eoa_balances: eoa,
    smart_balances: smart,
  });
}

export async function handleWalletByAddress(req: Request, res: Response): Promise<void> {
  const address = String(req.query.address ?? "").trim();
  if (!/^[GC][A-Z0-9]{55}$/.test(address)) {
    res.status(400).json({ error: "invalid stellar address" });
    return;
  }
  const balances = await readBalances(address, address);
  res.json({ address, balances });
}

/**
 * "Fund Calypso" — the conscious UX action where the user tops up the
 * orchestrator's USDC balance. On testnet this is a direct admin mint
/**
 * Demo-only faucet: mint test USDC directly to any Stellar address.
 * Used by the /wallets page to give the user's Freighter wallet a
 * pile of test USDC so they can simulate funding the orchestrator.
 */
export async function handleMintUsdcToAddress(req: Request, res: Response): Promise<void> {
  if (!ENV.X402_DEMO_MODE) {
    res.status(403).json({ error: "mint faucet only available in demo mode" });
    return;
  }
  const address = String(req.body?.address ?? "").trim();
  const amount = Number(req.body?.usdc_amount ?? 0);
  if (!/^[GC][A-Z0-9]{55}$/.test(address)) {
    res.status(400).json({ error: "invalid stellar address" });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    res.status(400).json({ error: "usdc_amount must be > 0 and <= 10000" });
    return;
  }
  try {
    const { mintUsdcTo, canMintUsdc } = await import("../../orchestrator/usdcAdmin.js");
    if (!canMintUsdc()) {
      res.status(500).json({ error: "USDC_ADMIN_SECRET not configured" });
      return;
    }
    const hash = await mintUsdcTo(address, amount);
    res.json({ ok: true, tx: hash, amount_usdc: amount, recipient: address });
  } catch (err) {
    logger.error({ err }, "mintUsdcToAddress failed");
    res
      .status(500)
      .json({ error: "mint failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

