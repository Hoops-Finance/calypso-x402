import {
  rpc,
  Address,
  nativeToScVal,
  Transaction,
} from "@stellar/stellar-sdk";
import type { LpPlan } from "hoops-sdk-types";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToAddress, buildLpPlansVecScVal } from "../network/scval.js";

export class SmartAccountContract {
  constructor(
    private readonly accountId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string
  ) {}

  async owner(caller: string): Promise<string> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.accountId,
      "owner",
      []
    );
    const result = await simulateRead(this.server, tx, scValToAddress);
    if (!result) throw new Error("owner() returned null");
    return result;
  }

  async router(caller: string): Promise<string> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.accountId,
      "router",
      []
    );
    const result = await simulateRead(this.server, tx, scValToAddress);
    if (!result) throw new Error("router() returned null");
    return result;
  }

  async buildInitializeTx(
    ownerPubkey: string,
    router: string
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "initialize",
      [
        nativeToScVal(ownerPubkey, { type: "address" }),
        nativeToScVal(router, { type: "address" }),
      ]
    );
  }

  async buildSwapTx(
    ownerPubkey: string,
    tokenIn: string,
    tokenOut: string,
    amount: bigint,
    bestHop: string,
    deadline: number
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "swap",
      [
        new Address(tokenIn).toScVal(),
        new Address(tokenOut).toScVal(),
        nativeToScVal(amount, { type: "i128" }),
        new Address(bestHop).toScVal(),
        nativeToScVal(deadline, { type: "u32" }),
      ]
    );
  }

  async buildDepositTx(
    ownerPubkey: string,
    usdcToken: string,
    usdcAmount: bigint,
    plans: LpPlan[],
    deadline: number
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "deposit",
      [
        new Address(usdcToken).toScVal(),
        nativeToScVal(usdcAmount, { type: "i128" }),
        buildLpPlansVecScVal(plans),
        nativeToScVal(deadline, { type: "u32" }),
      ]
    );
  }

  async buildRedeemTx(
    ownerPubkey: string,
    lpToken: string,
    lpAmount: bigint,
    tokenA: string,
    tokenB: string,
    deadline: number
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "redeem",
      [
        new Address(lpToken).toScVal(),
        nativeToScVal(lpAmount, { type: "i128" }),
        new Address(tokenA).toScVal(),
        new Address(tokenB).toScVal(),
        nativeToScVal(deadline, { type: "u32" }),
      ]
    );
  }

  async buildClaimTx(
    ownerPubkey: string,
    adapter: string,
    pool: string,
    rewardToken: string
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "claim",
      [
        new Address(adapter).toScVal(),
        new Address(pool).toScVal(),
        new Address(rewardToken).toScVal(),
      ]
    );
  }

  async buildTransferTx(
    ownerPubkey: string,
    token: string,
    to: string,
    amount: bigint
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "transfer",
      [
        new Address(token).toScVal(),
        new Address(to).toScVal(),
        nativeToScVal(amount, { type: "i128" }),
      ]
    );
  }

  async buildUpgradeTx(
    ownerPubkey: string,
    wasmHash: string
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      ownerPubkey,
      this.passphrase,
      this.accountId,
      "upgrade",
      [nativeToScVal(Buffer.from(wasmHash, "hex"), { type: "bytes" })]
    );
  }
}
