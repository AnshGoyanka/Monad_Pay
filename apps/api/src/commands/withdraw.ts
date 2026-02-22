import { parseEther } from "viem";
import type { ParsedCommand, ChatResponse } from "@chatpay/shared";
import { prisma } from "../config/database.js";
import { verifyPin } from "../security/pinAuth.js";
import { decryptWalletAddress } from "../services/wallet.js";
import { getPoolBalance, executePoolWithdraw } from "../services/relayer.js";
import { getSession, setSession, clearSession } from "../services/session.js";
import { generateRefId } from "../security/encryption.js";
import { logger } from "../config/logger.js";
import type { Hex } from "viem";

/**
 * Withdraw command — withdraw MON from pool to user's wallet.
 */
export async function handleWithdraw(
  userId: string,
  command: ParsedCommand
): Promise<ChatResponse> {
  if (!command.amount || parseFloat(command.amount) <= 0) {
    return { message: "How much do you want to withdraw? Just say something like _withdraw 5 monad_ 🏧" };
  }

  // Check PIN exists
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true },
  });

  if (!sender?.pinHash) {
    return { message: "You need a PIN first! Say _my pin is 1234_ to set one up 🔑" };
  }

  // Check balance
  const userAddress = await decryptWalletAddress(userId) as Hex;
  const balance = await getPoolBalance(userAddress);
  const amountWei = parseEther(command.amount);

  if (balance < amountWei) {
    return {
      message: `Not enough balance — you have *${(Number(balance) / 1e18).toFixed(4)} MON*. Try a smaller amount.`,
    };
  }

  // Store pending and ask for PIN
  await setSession(userId, "awaiting_pin_for_send", {
    pendingCommand: { ...command, type: "withdraw" },
  });

  return {
    message: `Withdrawing *${command.amount} MON* to your wallet 🔐\n\nType your 4-digit PIN to confirm:`,
    expectingReply: true,
  };
}

/**
 * Execute withdrawal after PIN verification.
 */
export async function executeWithdrawWithPin(
  userId: string,
  pin: string
): Promise<ChatResponse> {
  const session = await getSession(userId);

  if (
    session.step !== "awaiting_pin_for_send" ||
    !session.pendingCommand ||
    session.pendingCommand.type !== "withdraw"
  ) {
    await clearSession(userId);
    return { message: "No pending withdrawal. Say _withdraw 5 monad_ to start one." };
  }

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true },
  });

  if (!sender?.pinHash) {
    await clearSession(userId);
    return { message: "You need to set a PIN first. Say _my pin is 1234_" };
  }

  const pinResult = await verifyPin(userId, pin, sender.pinHash);

  if (pinResult.locked) {
    await clearSession(userId);
    return { message: "Account locked 🔒 Too many wrong attempts. Try again in 15 minutes." };
  }

  if (!pinResult.valid) {
    return {
      message: `Wrong PIN. ${pinResult.attemptsLeft} attempts left — try again:`,
      expectingReply: true,
    };
  }

  await clearSession(userId);

  const amount = session.pendingCommand.amount!;
  const amountWei = parseEther(amount);
  const userAddress = await decryptWalletAddress(userId) as Hex;

  try {
    const txHash = await executePoolWithdraw(userAddress, userAddress, amountWei);

    // Record transaction
    await prisma.transaction.create({
      data: {
        senderId: userId,
        recipientId: userId,
        amount: parseFloat(amount),
        currency: "MON",
        txType: "withdraw",
        txHash,
        refId: generateRefId(),
        status: "pending",
      },
    });

    logger.info({ userId }, "Withdrawal submitted");

    return {
      message: `Withdrawal started! *${amount} MON* heading to your wallet ⚡\n\nTx: ${txHash}`,
    };
  } catch (error) {
    logger.error({ err: error, userId }, "Withdrawal failed");
    return { message: "Withdrawal didn't go through. Try again in a moment 🙏" };
  }
}
