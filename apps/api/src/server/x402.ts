/**
 * x402.ts — Express payment middleware for Calypso's gated endpoints.
 *
 * Route configuration uses AssetAmount directly instead of a dollar
 * string, which pins the payment asset to the Hoops testnet USDC
 * contract. The default ExactStellarScheme behavior falls back to
 * Circle's testnet USDC contract which the agent wallet has no
 * trustline to — so explicitly specifying the Hoops USDC contract
 * keeps the x402 handshake working against the agent we control.
 *
 * USDC amounts are specified in stroops (7 decimals):
 *   $0.01 = 100_000 stroops
 *   $0.05 = 500_000 stroops
 */

import { paymentMiddlewareFromConfig } from "@x402/express";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import type { Network, SchemeNetworkServer } from "@x402/core/types";
import { ENV } from "../env.js";
import { TOKENS } from "../constants.js";
import { logger } from "../logger.js";
import { buildLocalFacilitator } from "./localFacilitator.js";

const network = ENV.X402_NETWORK as Network;
const HOOPS_USDC_ASSET = TOKENS.usdc;

const routes = {
  "POST /plan": {
    accepts: {
      scheme: "exact",
      price: { asset: HOOPS_USDC_ASSET, amount: "100000" }, // $0.01 USDC
      network,
      payTo: ENV.PAY_TO,
    },
    description: "AI-planned session config for a Calypso bot swarm",
  },
  "POST /simulate": {
    accepts: {
      scheme: "exact",
      price: { asset: HOOPS_USDC_ASSET, amount: "500000" }, // $0.05 USDC
      network,
      payTo: ENV.PAY_TO,
    },
    description: "Registers a Calypso simulation session and returns an id",
  },
  "POST /analyze": {
    accepts: {
      scheme: "exact",
      price: { asset: HOOPS_USDC_ASSET, amount: "100000" }, // $0.01 USDC
      network,
      payTo: ENV.PAY_TO,
    },
    description: "On-chain protocol analysis for a set of contracts",
  },
};

export async function buildX402Middleware() {
  logger.info(
    {
      payTo: ENV.PAY_TO,
      network: ENV.X402_NETWORK,
      asset: HOOPS_USDC_ASSET,
    },
    "x402: configuring payment middleware (Hoops testnet USDC, local facilitator)",
  );
  const { client: facilitator, facilitatorPubkey } = await buildLocalFacilitator(network);
  logger.info({ facilitatorPubkey }, "x402: in-process facilitator ready");
  const schemes: { network: Network; server: SchemeNetworkServer }[] = [
    { network, server: new ExactStellarScheme() },
  ];
  return paymentMiddlewareFromConfig(routes, facilitator, schemes);
}
