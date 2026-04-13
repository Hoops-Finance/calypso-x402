import {
  Keypair,
  rpc,
  TransactionBuilder,
  Contract,
  xdr,
  BASE_FEE,
  Transaction,
} from "@stellar/stellar-sdk";
import { TX_DEFAULTS } from "hoops-sdk-types";
import type { TxSigner } from "hoops-sdk-types";

export interface SubmitResult {
  hash: string;
  response: rpc.Api.GetSuccessfulTransactionResponse;
}

export async function buildContractCallTx(
  server: rpc.Server,
  pubkey: string,
  passphrase: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<Transaction> {
  const sourceAccount = await server.getAccount(pubkey);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TX_DEFAULTS.timeoutSeconds)
    .build();
  return tx;
}

export async function simulateRead<T>(
  server: rpc.Server,
  tx: Transaction,
  decoder: (val: xdr.ScVal) => T
): Promise<T | null> {
  const sim = await server.simulateTransaction(tx);
  if ("result" in sim && sim.result) {
    const retVal = (sim.result as { retval?: xdr.ScVal }).retval;
    if (retVal) return decoder(retVal);
  }
  return null;
}

export async function signAndSubmitTx(
  server: rpc.Server,
  keypair: Keypair,
  tx: Transaction
): Promise<SubmitResult> {
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const sendResp = await server.sendTransaction(prepared);
  if (sendResp.status !== "PENDING") {
    throw new Error(
      `TX submission failed: ${sendResp.status} ${JSON.stringify(sendResp)}`
    );
  }
  const response = await waitForTx(server, sendResp.hash);
  return { hash: sendResp.hash, response };
}

export async function signExternalAndSubmitTx(
  server: rpc.Server,
  tx: Transaction,
  passphrase: string,
  signer: TxSigner
): Promise<SubmitResult> {
  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signer(prepared.toXDR(), {
    network: "testnet",
    networkPassphrase: passphrase,
  });
  const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);
  const sendResp = await server.sendTransaction(signedTx);
  if (sendResp.status !== "PENDING") {
    throw new Error(
      `TX submission failed: ${sendResp.status} ${JSON.stringify(sendResp)}`
    );
  }
  const response = await waitForTx(server, sendResp.hash);
  return { hash: sendResp.hash, response };
}

export async function waitForTx(
  server: rpc.Server,
  hash: string
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  let response = await server.getTransaction(hash);
  let attempts = 0;
  while ((response.status as string) === "NOT_FOUND" && attempts < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    response = await server.getTransaction(hash);
    attempts++;
  }
  if ((response.status as string) !== "SUCCESS") {
    throw new Error(`TX failed: ${response.status}`);
  }
  return response as rpc.Api.GetSuccessfulTransactionResponse;
}

export function getDeadline(offsetSeconds: number = TX_DEFAULTS.deadlineOffsetSeconds): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}
