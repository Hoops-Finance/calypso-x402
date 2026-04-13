import { rpc } from "@stellar/stellar-sdk";
import type { BalanceMap, AddressBook } from "hoops-sdk-types";
import { TokenContract } from "../contracts/token.js";
import { AquaRewardsContract } from "../contracts/aquaRewards.js";

export async function getTokenBalance(
  server: rpc.Server,
  passphrase: string,
  caller: string,
  tokenId: string,
  account: string
): Promise<bigint> {
  const token = new TokenContract(tokenId, server, passphrase);
  return token.balance(caller, account);
}

export async function getBalances(
  server: rpc.Server,
  passphrase: string,
  caller: string,
  tokenIds: string[],
  account: string
): Promise<Record<string, bigint>> {
  const results = await Promise.all(
    tokenIds.map((id) => getTokenBalance(server, passphrase, caller, id, account))
  );
  const map: Record<string, bigint> = {};
  for (let i = 0; i < tokenIds.length; i++) {
    map[tokenIds[i]] = results[i];
  }
  return map;
}

export async function getStandardBalances(
  server: rpc.Server,
  passphrase: string,
  caller: string,
  account: string,
  addressBook: AddressBook
): Promise<{ xlm: bigint; usdc: bigint }> {
  const [xlm, usdc] = await Promise.all([
    getTokenBalance(server, passphrase, caller, addressBook.tokens.xlm, account),
    getTokenBalance(server, passphrase, caller, addressBook.tokens.usdc, account),
  ]);
  return { xlm, usdc };
}

export async function getAquaLpBalance(
  server: rpc.Server,
  passphrase: string,
  caller: string,
  account: string,
  addressBook: AddressBook
): Promise<bigint> {
  const aqua = new AquaRewardsContract(
    addressBook.adapters.aqua,
    server,
    passphrase
  );
  return aqua.getLpBalance(caller, account, addressBook.pools.aquaPool);
}
