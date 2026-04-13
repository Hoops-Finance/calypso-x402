import { Keypair } from "@stellar/stellar-sdk";
import { type HoopsNetwork, type SessionState, type LocalSwapQuote, type SwapQuote, type SwapParams, type DepositParams, type LpPosition } from "hoops-sdk-types";
export interface CreateSessionOptions {
    network: HoopsNetwork;
    keypair: Keypair;
    smartAccountId?: string;
}
export declare class HoopsSession {
    readonly network: HoopsNetwork;
    readonly keypair: Keypair;
    private readonly server;
    private readonly config;
    private readonly addressBook;
    private smartAccountId;
    constructor(network: HoopsNetwork, keypair: Keypair, smartAccountId?: string);
    get publicKey(): string;
    get state(): SessionState;
    private requireSmartAccount;
    deploySmartAccount(): Promise<string>;
    getBalances(): Promise<{
        xlm: bigint;
        usdc: bigint;
    }>;
    getSwapQuoteXlmToUsdc(xlmAmount: number): Promise<LocalSwapQuote>;
    getBestQuote(amount: bigint, tokenIn: string, tokenOut: string): Promise<SwapQuote | null>;
    getAllQuotes(amount: bigint, tokenIn: string, tokenOut: string): Promise<SwapQuote[]>;
    swap(params: SwapParams): Promise<string>;
    swapXlmToUsdc(xlmAmount: number, poolAddress?: string): Promise<string>;
    fundAccountXlm(xlmAmount: number): Promise<void>;
    deposit(params?: DepositParams): Promise<void>;
    redeem(): Promise<void>;
    claimRewards(): Promise<string>;
    upgradeAccount(): Promise<void>;
    getLpPositions(): Promise<LpPosition[]>;
}
export declare function createSession(opts: CreateSessionOptions): HoopsSession;
//# sourceMappingURL=session.d.ts.map