import { type Hex, parseEther, formatEther, keccak256, toHex } from "viem";

import { prisma } from "../config/database.js";
import { logger } from "../config/logger.js";
import { generateRefId } from "../security/encryption.js";
import { decryptWalletAddress } from "./wallet.js";
import { executePoolTransfer, executePoolWithdraw, getPoolBalance } from "./relayer.js";
import type { TxSubmitJob, TxStatus, TransactionResult } from "@chatpay/shared";
import { HISTORY_PAGE_SIZE } from "@chatpay/shared";

// ──────────────────────── Submit Transfer ────────────────────────

/**
 * Process a transfer job: decrypt addresses, call pool contract, record tx.
 */
export async function processTransfer(job: TxSubmitJob): Promise<TransactionResult> {
  const { refId, senderUserId, recipientUserId, amount, idempotencyKey } = job;

  // Check idempotency — if this tx was already processed, return cached result
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    logger.info({ refId }, "Duplicate transfer detected, returning cached result");
    return {
      refId: existing.refId,
      txHash: existing.txHash,
      status: existing.status as TxStatus,
      amount: existing.amount.toString(),
      currency: existing.currency,
    };
  }

  // Decrypt addresses (in-memory only)
  const senderAddress = await decryptWalletAddress(senderUserId) as Hex;
  const recipientAddress = await decryptWalletAddress(recipientUserId) as Hex;

  const amountWei = BigInt(amount);
  const refIdBytes = keccak256(toHex(refId)) as Hex;

  // Create pending transaction record
  const tx = await prisma.transaction.create({
    data: {
      senderId: senderUserId,
      recipientId: recipientUserId,
      amount: parseFloat(formatEther(amountWei)),
      currency: "MON",
      txType: "transfer",
      refId,
      status: "pending",
      idempotencyKey,
    },
  });

  try {
    // Execute on-chain
    const txHash = await executePoolTransfer(
      senderAddress,
      recipientAddress,
      amountWei,
      refIdBytes
    );

    // Update with tx hash
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { txHash },
    });

    return {
      refId,
      txHash,
      status: "pending",
      amount: formatEther(amountWei),
      currency: "MON",
    };
  } catch (error) {
    // Mark as failed
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}

// ──────────────────────── Confirm Transaction ───────────────────

/**
 * Check on-chain confirmation and update DB.
 */
export async function confirmTransaction(
  txHash: string,
  transactionId: string
): Promise<TxStatus> {
  const { getPublicClient } = await import("./blockchain.js");
  const publicClient = getPublicClient();

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as Hex,
    });

    if (receipt.status === "success") {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: "confirmed",
          gasUsed: receipt.gasUsed,
          gasPrice: receipt.effectiveGasPrice,
          blockNumber: receipt.blockNumber,
          confirmedAt: new Date(),
        },
      });
      return "confirmed";
    } else {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: "failed",
          errorMessage: "Transaction reverted on-chain",
          gasUsed: receipt.gasUsed,
          blockNumber: receipt.blockNumber,
        },
      });
      return "failed";
    }
  } catch (error) {
    // Receipt not available yet — still pending
    logger.debug({ txHash }, "Receipt not yet available");
    return "pending";
  }
}

// ──────────────────────── Balance ────────────────────────────────

/**
 * Get pool balance for a user (in MON).
 */
export async function getUserBalance(userId: string): Promise<string> {
  const address = await decryptWalletAddress(userId) as Hex;
  const balanceWei = await getPoolBalance(address);
  return formatEther(balanceWei);
}

/**
 * Get native (on-chain) wallet balance for a user (in MON).
 */
export async function getUserNativeBalance(userId: string): Promise<string> {
  const { getPublicClient } = await import("./blockchain.js");
  const address = await decryptWalletAddress(userId) as Hex;
  const publicClient = getPublicClient();
  const balanceWei = await publicClient.getBalance({ address });
  return formatEther(balanceWei);
}

// ──────────────────────── History ────────────────────────────────

export interface TxHistoryEntry {
  refId: string;
  type: "sent" | "received" | "deposit" | "withdraw";
  amount: string;
  currency: string;
  status: string;
  counterpartyLast4: string | null;
  createdAt: Date;
}

/**
 * Get transaction history for a user.
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = HISTORY_PAGE_SIZE
): Promise<TxHistoryEntry[]> {
  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      sender: { select: { phoneLast4: true } },
      recipient: { select: { phoneLast4: true } },
    },
  });

  return transactions.map((tx) => {
    const isSender = tx.senderId === userId;
    let type: TxHistoryEntry["type"];

    if (tx.txType === "deposit") type = "deposit";
    else if (tx.txType === "withdraw") type = "withdraw";
    else type = isSender ? "sent" : "received";

    return {
      refId: tx.refId,
      type,
      amount: tx.amount.toString(),
      currency: tx.currency,
      status: tx.status,
      counterpartyLast4: isSender
        ? tx.recipient.phoneLast4
        : tx.sender.phoneLast4,
      createdAt: tx.createdAt,
    };
  });
}

// ──────────────────────── Idempotency Key ────────────────────────

/**
 * Generate an idempotency key for a transfer command.
 */
export function buildIdempotencyKey(
  senderUserId: string,
  recipientUserId: string,
  amountWei: string,
  windowMs: number = 60_000
): string {
  const window = Math.floor(Date.now() / windowMs);
  return keccak256(
    toHex(`${senderUserId}:${recipientUserId}:${amountWei}:${window}`)
  );
}
