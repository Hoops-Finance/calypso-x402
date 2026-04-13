import { Keypair, rpc } from "@stellar/stellar-sdk";
import {
  getAddressBook,
  type HoopsNetwork,
  type AddressBook,
  type SessionState,
  type LocalSwapQuote,
  type SwapQuote,
  type SwapParams,
  type DepositParams,
  type LpPosition,
  type LpPlan,
  HoopsError,
  HoopsErrorCode,
} from "hoops-sdk-types";
import {
  createRpcClientForNetwork,
  getNetworkConfig,
  SmartAccountContract,
  TokenContract,
  signAndSubmitTx,
  getStandardBalances,
  getAquaLpBalance,
  getAllLpPositions,
  getQuoteXlmToUsdc,
  getOnChainBestQuote,
  getOnChainAllQuotes,
  toStroops,
  getDeadline,
} from "hoops-sdk-core";
import { deploySmartAccount } from "./deploy.js";
import { swap as swapAction, swapXlmToUsdc as swapXlmToUsdcAction } from "./swap.js";
import { addLiquidity } from "./liquidity.js";
import { claimAquaRewards } from "./rewards.js";
import { withdrawAllLiquidity } from "./withdraw.js";
import { normalizeHoopsError } from "./errorMapping.js";

export interface CreateSessionOptions {
  network: HoopsNetwork;
  keypair: Keypair;
  smartAccountId?: string;
}

export class HoopsSession {
  private readonly server: rpc.Server;
  private readonly config: ReturnType<typeof getNetworkConfig>;
  private readonly addressBook: AddressBook;
  private smartAccountId: string | null;

  constructor(
    readonly network: HoopsNetwork,
    readonly keypair: Keypair,
    smartAccountId?: string
  ) {
    this.server = createRpcClientForNetwork(network);
    this.config = getNetworkConfig(network);
    this.addressBook = getAddressBook(network);
    this.smartAccountId = smartAccountId ?? null;
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  get state(): SessionState {
    return {
      network: this.network,
      publicKey: this.publicKey,
      smartAccountId: this.smartAccountId,
    };
  }

  private requireSmartAccount(): string {
    if (!this.smartAccountId) {
      throw new HoopsError(
        HoopsErrorCode.WALLET_NOT_CONNECTED,
        "Smart account not deployed. Call deploySmartAccount() first."
      );
    }
    return this.smartAccountId;
  }

  async deploySmartAccount(): Promise<string> {
    try {
      const accountId = await deploySmartAccount(this.keypair, this.network);
      this.smartAccountId = accountId;
      return accountId;
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async getBalances(): Promise<{ xlm: bigint; usdc: bigint }> {
    const accountId = this.requireSmartAccount();
    try {
      return await getStandardBalances(
        this.server,
        this.config.passphrase,
        this.publicKey,
        accountId,
        this.addressBook
      );
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async getSwapQuoteXlmToUsdc(xlmAmount: number): Promise<LocalSwapQuote> {
    try {
      return await getQuoteXlmToUsdc(
        this.server,
        this.config.passphrase,
        this.publicKey,
        xlmAmount,
        this.addressBook
      );
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async getBestQuote(
    amount: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<SwapQuote | null> {
    try {
      return await getOnChainBestQuote(
        this.server,
        this.config.passphrase,
        this.publicKey,
        amount,
        tokenIn,
        tokenOut,
        this.addressBook
      );
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async getAllQuotes(
    amount: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<SwapQuote[]> {
    try {
      return await getOnChainAllQuotes(
        this.server,
        this.config.passphrase,
        this.publicKey,
        amount,
        tokenIn,
        tokenOut,
        this.addressBook
      );
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async swap(params: SwapParams): Promise<string> {
    const accountId = this.requireSmartAccount();
    try {
      return await swapAction(this.keypair, accountId, this.network, params);
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async swapXlmToUsdc(xlmAmount: number, poolAddress?: string): Promise<string> {
    const accountId = this.requireSmartAccount();
    try {
      return await swapXlmToUsdcAction(
        this.keypair, accountId, xlmAmount, this.network, poolAddress
      );
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async fundAccountXlm(xlmAmount: number): Promise<void> {
    const accountId = this.requireSmartAccount();
    try {
      const token = new TokenContract(
        this.addressBook.tokens.xlm,
        this.server,
        this.config.passphrase
      );
      const tx = await token.buildTransferTx(
        this.publicKey,
        accountId,
        toStroops(xlmAmount)
      );
      await signAndSubmitTx(this.server, this.keypair, tx);
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async deposit(params?: DepositParams): Promise<void> {
    this.requireSmartAccount();
    try {
      await addLiquidity(this.keypair, this.smartAccountId!, this.network, params);
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async redeem(): Promise<void> {
    this.requireSmartAccount();
    try {
      await withdrawAllLiquidity(this.keypair, this.smartAccountId!, this.network);
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async claimRewards(): Promise<string> {
    this.requireSmartAccount();
    try {
      return await claimAquaRewards(this.keypair, this.smartAccountId!, this.network);
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async upgradeAccount(): Promise<void> {
    const accountId = this.requireSmartAccount();
    try {
      const account = new SmartAccountContract(
        accountId,
        this.server,
        this.config.passphrase
      );
      const tx = await account.buildUpgradeTx(this.publicKey, this.addressBook.wasmHash);
      await signAndSubmitTx(this.server, this.keypair, tx);
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }

  async getLpPositions(): Promise<LpPosition[]> {
    const accountId = this.requireSmartAccount();
    try {
      return await getAllLpPositions(
        this.server,
        this.config.passphrase,
        this.publicKey,
        accountId,
        this.addressBook
      );
    } catch (e) {
      throw normalizeHoopsError(e);
    }
  }
}

export function createSession(opts: CreateSessionOptions): HoopsSession {
  return new HoopsSession(opts.network, opts.keypair, opts.smartAccountId);
}
