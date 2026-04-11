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
