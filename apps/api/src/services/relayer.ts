import { privateKeyToAccount, type PrivateKeyAccount, HDKey } from "viem/accounts";
import { type Hex, type Hash, encodeFunctionData, parseEther, formatEther } from "viem";
import { mnemonicToSeedSync } from "@scure/bip39";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  getPublicClient,
  createRelayerWalletClient,
  PAYMENT_POOL_ABI,
} from "./blockchain.js";
import { acquireNonce, reclaimNonce } from "./nonce.js";
import { getGasPrice, addGasBuffer } from "./gas.js";
import { RELAYER_LOW_BALANCE_THRESHOLD } from "@chatpay/shared";

// ──────────────────────── Relayer Setup ─────────────────────────

let _relayerAccount: PrivateKeyAccount | null = null;

/**
 * Initialize the relayer account by deriving from the HD mnemonic (index 0).
 * Call once on server startup.
 */
export function initRelayer(): PrivateKeyAccount {
  if (_relayerAccount) return _relayerAccount;

  // Derive relayer key from mnemonic at m/44'/60'/0'/0/0
  const seed = mnemonicToSeedSync(env.HD_MNEMONIC);
  const hdKey = HDKey.fromMasterSeed(seed);
  const derived = hdKey.derive("m/44'/60'/0'/0/0");

  if (!derived.privateKey) {
    throw new Error("Failed to derive relayer private key from mnemonic");
  }

  const privateKey = `0x${Buffer.from(derived.privateKey).toString("hex")}` as Hex;
  _relayerAccount = privateKeyToAccount(privateKey);

  logger.info({ address: _relayerAccount.address }, "Relayer account initialized from mnemonic");
  return _relayerAccount;
}

export function getRelayerAccount(): PrivateKeyAccount {
  if (!_relayerAccount) {
    throw new Error("Relayer not initialized. Call initRelayer() first.");
  }
  return _relayerAccount;
}

export function getRelayerAddress(): Hex {
  return getRelayerAccount().address;
}

// ──────────────────────── Pool Interactions ──────────────────────

const poolAddress = env.PAYMENT_POOL_ADDRESS as Hex;

/**
 * Execute a gasless transfer inside the PaymentPool contract.
 * Only the relayer signs and pays gas.
 *
 * @returns Transaction hash
 */
export async function executePoolTransfer(
  fromAddress: Hex,
  toAddress: Hex,
  amountWei: bigint,
  refId: Hex
): Promise<Hash> {
  const account = getRelayerAccount();
  const walletClient = createRelayerWalletClient(account);
  const publicClient = getPublicClient();
  const nonce = await acquireNonce();

  try {
    const gasPrice = await getGasPrice();

    // Estimate gas
    const gasEstimate = await publicClient.estimateGas({
      account: account.address,
      to: poolAddress,
      data: encodeFunctionData({
        abi: PAYMENT_POOL_ABI,
        functionName: "transfer",
        args: [fromAddress, toAddress, amountWei, refId],
      }),
    });

    const gas = addGasBuffer(gasEstimate);

    // Send transaction
    const txHash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: poolAddress,
      data: encodeFunctionData({
        abi: PAYMENT_POOL_ABI,
        functionName: "transfer",
        args: [fromAddress, toAddress, amountWei, refId],
      }),
      gas,
      gasPrice,
      nonce,
    });

    logger.info({ refId, nonce }, "Pool transfer submitted");
    return txHash;
  } catch (error) {
    // Reclaim nonce if tx was never broadcast
    await reclaimNonce(nonce);
    logger.error({ err: error, refId, nonce }, "Pool transfer failed");
    throw error;
  }
}

/**
 * Execute a withdrawal from the pool to user's wallet.
 */
export async function executePoolWithdraw(
  fromAddress: Hex,
  toAddress: Hex,
  amountWei: bigint
): Promise<Hash> {
  const account = getRelayerAccount();
  const walletClient = createRelayerWalletClient(account);
  const publicClient = getPublicClient();
  const nonce = await acquireNonce();

  try {
    const gasPrice = await getGasPrice();

    const gasEstimate = await publicClient.estimateGas({
      account: account.address,
      to: poolAddress,
      data: encodeFunctionData({
        abi: PAYMENT_POOL_ABI,
        functionName: "withdraw",
        args: [fromAddress, toAddress, amountWei],
      }),
    });

    const gas = addGasBuffer(gasEstimate);

    const txHash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: poolAddress,
      data: encodeFunctionData({
        abi: PAYMENT_POOL_ABI,
        functionName: "withdraw",
        args: [fromAddress, toAddress, amountWei],
      }),
      gas,
      gasPrice,
      nonce,
    });

    logger.info({ nonce }, "Pool withdrawal submitted");
    return txHash;
  } catch (error) {
    await reclaimNonce(nonce);
    logger.error({ err: error, nonce }, "Pool withdrawal failed");
    throw error;
  }
}

/**
 * Check a user's balance in the payment pool.
 */
export async function getPoolBalance(userAddress: Hex): Promise<bigint> {
  const publicClient = getPublicClient();

  const balance = await publicClient.readContract({
    address: poolAddress,
    abi: PAYMENT_POOL_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return balance as bigint;
}

/**
 * Check the relayer's native balance for gas monitoring.
 */
export async function getRelayerBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  const address = getRelayerAddress();

  return publicClient.getBalance({ address });
}

/**
 * Check if relayer gas balance is critically low.
 */
export async function isRelayerLowOnGas(): Promise<boolean> {
  const balance = await getRelayerBalance();
  return balance < BigInt(RELAYER_LOW_BALANCE_THRESHOLD);
}
