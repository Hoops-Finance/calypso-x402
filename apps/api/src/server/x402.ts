/**
 * x402.ts — Express payment middleware for Calypso's gated endpoints.
 *
 * Gated routes, prices, and payment destination all live here. Pairing
 * with a facilitator at www.x402.org by default; set X402_FACILITATOR_URL
 * to self-host (e.g. OpenZeppelin Relayer).
 */

import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import type { Network, SchemeNetworkServer } from "@x402/core/types";
import { ENV } from "../env.js";
import { logger } from "../logger.js";

const network = ENV.X402_NETWORK as Network;

const routes = {
  "POST /plan": {
    accepts: {
      scheme: "exact",
      price: "$0.50",
      network,
      payTo: ENV.PAY_TO,
    },
    description: "AI-planned session config for a Calypso bot swarm",
  },
  "POST /simulate": {
    accepts: {
      scheme: "exact",
      price: "$2.00",
      network,
      payTo: ENV.PAY_TO,
    },
    description: "Launches a live bot swarm on Stellar testnet",
  },
  "POST /analyze": {
    accepts: {
      scheme: "exact",
      price: "$0.50",
      network,
      payTo: ENV.PAY_TO,
    },
    description: "On-chain protocol analysis for a set of contracts",
  },
};

export function buildX402Middleware() {
  logger.info(
    { payTo: ENV.PAY_TO, facilitator: ENV.X402_FACILITATOR_URL, network: ENV.X402_NETWORK },
    "x402: configuring payment middleware",
  );
  const facilitator = new HTTPFacilitatorClient({ url: ENV.X402_FACILITATOR_URL });
  const schemes: { network: Network; server: SchemeNetworkServer }[] = [
    { network, server: new ExactStellarScheme() },
  ];
  return paymentMiddlewareFromConfig(routes, facilitator, schemes);
}
