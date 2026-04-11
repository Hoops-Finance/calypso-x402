/**
 * wallets.ts — read-only wallet inspection endpoints.
 *
 *   GET /wallets/platform         → PAY_TO wallet + its XLM/USDC balance
 *   GET /sessions/:id/wallets     → per-bot EOA + smart-account balances
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
import { getSession } from "../../orchestrator/session.js";
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
 * to the orchestrator's smart account. In production it would be a
 * real x402 USDC payment from the user's Freighter wallet.
 */
export async function handlePlatformTopUp(req: Request, res: Response): Promise<void> {
  if (!ENV.X402_DEMO_MODE) {
    res.status(403).json({ error: "topup only available in demo mode" });
    return;
  }
  const amount = Number(req.body?.usdc_amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    res.status(400).json({ error: "usdc_amount must be > 0 and <= 10000" });
    return;
  }
  try {
    const platform = PlatformWallet.get();
    const mintHash = await platform.topUpUsdc(amount);
    const addr = ENV.PAY_TO;
    const smartAccountId = platform.state.smartAccountId;
    const [eoa, smart] = await Promise.all([
      readBalances(addr, addr),
      smartAccountId ? readBalances(addr, smartAccountId) : Promise.resolve({ xlm: "0", usdc: "0" }),
    ]);
    res.json({
      ok: true,
      mint_tx: mintHash,
      amount_usdc: amount,
      smart_account: smartAccountId,
      balances: {
        xlm: (BigInt(eoa.xlm) + BigInt(smart.xlm)).toString(),
        usdc: (BigInt(eoa.usdc) + BigInt(smart.usdc)).toString(),
      },
    });
  } catch (err) {
    logger.error({ err }, "platformTopUp failed");
    res
      .status(500)
      .json({ error: "topup failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

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

export async function handleSessionWallets(req: Request, res: Response): Promise<void> {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  // Read all bot balances in parallel. Each bot = 1 EOA + 1 smart account,
  // so N bots = 2N balance reads. Worth parallelizing.
  const walletEntries = await Promise.all(
    session.bots.map(async (bot) => {
      const [eoaBalances, smartBalances] = await Promise.all([
        readBalances(bot.pubkey, bot.pubkey),
        readBalances(bot.pubkey, bot.smartAccountId),
      ]);
      const cfg = session.botConfigs.find((b) => b.bot_id === bot.botId);
      return {
        bot_id: bot.botId,
        archetype: cfg?.archetype ?? "unknown",
        eoa: {
          address: bot.pubkey,
          balances: eoaBalances,
        },
        smart_account: {
          address: bot.smartAccountId,
          balances: smartBalances,
        },
      };
    }),
  );

  res.json({
    session_id: sessionId,
    session_name: session.name,
    status: session.status,
    bots: walletEntries,
  });
}
