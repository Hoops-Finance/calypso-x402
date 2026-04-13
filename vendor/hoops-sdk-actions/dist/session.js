import { getAddressBook, HoopsError, HoopsErrorCode, } from "hoops-sdk-types";
import { createRpcClientForNetwork, getNetworkConfig, SmartAccountContract, TokenContract, signAndSubmitTx, getStandardBalances, getAllLpPositions, getQuoteXlmToUsdc, getOnChainBestQuote, getOnChainAllQuotes, toStroops, } from "hoops-sdk-core";
import { deploySmartAccount } from "./deploy.js";
import { swap as swapAction, swapXlmToUsdc as swapXlmToUsdcAction } from "./swap.js";
import { addLiquidity } from "./liquidity.js";
import { claimAquaRewards } from "./rewards.js";
import { withdrawAllLiquidity } from "./withdraw.js";
import { normalizeHoopsError } from "./errorMapping.js";
export class HoopsSession {
    network;
    keypair;
    server;
    config;
    addressBook;
    smartAccountId;
    constructor(network, keypair, smartAccountId) {
        this.network = network;
        this.keypair = keypair;
        this.server = createRpcClientForNetwork(network);
        this.config = getNetworkConfig(network);
        this.addressBook = getAddressBook(network);
        this.smartAccountId = smartAccountId ?? null;
    }
    get publicKey() {
        return this.keypair.publicKey();
    }
    get state() {
        return {
            network: this.network,
            publicKey: this.publicKey,
            smartAccountId: this.smartAccountId,
        };
    }
    requireSmartAccount() {
        if (!this.smartAccountId) {
            throw new HoopsError(HoopsErrorCode.WALLET_NOT_CONNECTED, "Smart account not deployed. Call deploySmartAccount() first.");
        }
        return this.smartAccountId;
    }
    async deploySmartAccount() {
        try {
            const accountId = await deploySmartAccount(this.keypair, this.network);
            this.smartAccountId = accountId;
            return accountId;
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async getBalances() {
        const accountId = this.requireSmartAccount();
        try {
            return await getStandardBalances(this.server, this.config.passphrase, this.publicKey, accountId, this.addressBook);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async getSwapQuoteXlmToUsdc(xlmAmount) {
        try {
            return await getQuoteXlmToUsdc(this.server, this.config.passphrase, this.publicKey, xlmAmount, this.addressBook);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async getBestQuote(amount, tokenIn, tokenOut) {
        try {
            return await getOnChainBestQuote(this.server, this.config.passphrase, this.publicKey, amount, tokenIn, tokenOut, this.addressBook);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async getAllQuotes(amount, tokenIn, tokenOut) {
        try {
            return await getOnChainAllQuotes(this.server, this.config.passphrase, this.publicKey, amount, tokenIn, tokenOut, this.addressBook);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async swap(params) {
        const accountId = this.requireSmartAccount();
        try {
            return await swapAction(this.keypair, accountId, this.network, params);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async swapXlmToUsdc(xlmAmount, poolAddress) {
        const accountId = this.requireSmartAccount();
        try {
            return await swapXlmToUsdcAction(this.keypair, accountId, xlmAmount, this.network, poolAddress);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async fundAccountXlm(xlmAmount) {
        const accountId = this.requireSmartAccount();
        try {
            const token = new TokenContract(this.addressBook.tokens.xlm, this.server, this.config.passphrase);
            const tx = await token.buildTransferTx(this.publicKey, accountId, toStroops(xlmAmount));
            await signAndSubmitTx(this.server, this.keypair, tx);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async deposit(params) {
        this.requireSmartAccount();
        try {
            await addLiquidity(this.keypair, this.smartAccountId, this.network, params);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async redeem() {
        this.requireSmartAccount();
        try {
            await withdrawAllLiquidity(this.keypair, this.smartAccountId, this.network);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async claimRewards() {
        this.requireSmartAccount();
        try {
            return await claimAquaRewards(this.keypair, this.smartAccountId, this.network);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async upgradeAccount() {
        const accountId = this.requireSmartAccount();
        try {
            const account = new SmartAccountContract(accountId, this.server, this.config.passphrase);
            const tx = await account.buildUpgradeTx(this.publicKey, this.addressBook.wasmHash);
            await signAndSubmitTx(this.server, this.keypair, tx);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
    async getLpPositions() {
        const accountId = this.requireSmartAccount();
        try {
            return await getAllLpPositions(this.server, this.config.passphrase, this.publicKey, accountId, this.addressBook);
        }
        catch (e) {
            throw normalizeHoopsError(e);
        }
    }
}
export function createSession(opts) {
    return new HoopsSession(opts.network, opts.keypair, opts.smartAccountId);
}
//# sourceMappingURL=session.js.map