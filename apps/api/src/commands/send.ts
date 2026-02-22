import { parseEther } from "viem";
import type { ParsedCommand, ChatResponse, TxSubmitJob } from "@chatpay/shared";
import { QUEUE_TX_SUBMIT } from "@chatpay/shared";

import { prisma } from "../config/database.js";
import { logger } from "../config/logger.js";
import { verifyPin } from "../security/pinAuth.js";
import { generateRefId, hashPhone } from "../security/encryption.js";
import { resolveContactByName, resolveUserByPhone } from "../services/contacts.js";
import { userHasWallet, createWallet, decryptWalletAddress } from "../services/wallet.js";
import { getPoolBalance } from "../services/relayer.js";
import { buildIdempotencyKey } from "../services/payment.js";
import { getSession, setSession, clearSession } from "../services/session.js";
import { enqueueTxSubmit } from "../queue/producers.js";
import type { Hex } from "viem";

/**
 * Send command — transfer MON to another user.
 *
 * Flow:
 * 1. Parse amount + recipient
 * 2. Resolve recipient (by phone or contact name)
 * 3. Check balance
 * 4. Request PIN
 * 5. Verify PIN
 * 6. Enqueue transfer job
 */
export async function handleSend(
  userId: string,
  command: ParsedCommand,
  platform: "whatsapp" | "telegram",
  platformId: string
): Promise<ChatResponse> {
  // ── Validate amount ──
  if (!command.amount || parseFloat(command.amount) <= 0) {
    return { message: "How much do you want to send? Just tell me the amount and who to send it to 💸" };
  }

  const amountMon = command.amount;
  let amountWei: bigint;
  try {
    amountWei = parseEther(amountMon);
  } catch {
    return { message: "❌ Invalid amount format." };
  }

  // ── Check if sender has PIN ──
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true, status: true },
  });

  if (!sender?.pinHash) {
    return {
      message: "You need a PIN first! Just say _my pin is 1234_ to set one up 🔑",
    };
  }

  // ── Resolve recipient ──
  let recipientUserId: string | null = null;
  let recipientLabel: string;

  if (command.recipientPhone) {
    const resolved = await resolveUserByPhone(command.recipientPhone, platform, platformId);
    recipientUserId = resolved.userId;
    recipientLabel = `****${command.recipientPhone.slice(-4)}`;

    // Ensure recipient has a wallet
    const hasWallet = await userHasWallet(resolved.userId);
    if (!hasWallet) {
      await createWallet(resolved.userId);
    }
  } else if (command.recipientName) {
    recipientUserId = await resolveContactByName(userId, command.recipientName);
    recipientLabel = command.recipientName;

    if (!recipientUserId) {
      return {
        message: `I don't have a contact named "${command.recipientName}". Save them first:\n_save ${command.recipientName} +91..._`,
      };
    }
  } else {
    return {
      message: "Who should I send it to? Give me a name or phone number 📱",
    };
  }

  // Can't send to yourself
  if (recipientUserId === userId) {
    return { message: "You can't send money to yourself! 😄" };
  }

  // ── Check pool balance ──
  const senderAddress = await decryptWalletAddress(userId) as Hex;
  const balance = await getPoolBalance(senderAddress);

  if (balance < amountWei) {
    return {
      message: `Not enough balance — you have *${(Number(balance) / 1e18).toFixed(4)} MON*.\n\nSay _deposit_ to add more funds.`,
    };
  }

  // ── Store pending command and ask for PIN ──
  await setSession(userId, "awaiting_pin_for_send", {
    pendingCommand: command,
  });

  return {
    message: `Sending *${amountMon} MON* to ${recipientLabel} 🔐\n\nType your 4-digit PIN to confirm:`,
    expectingReply: true,
  };
}

/**
 * Confirm send with PIN verification.
 */
export async function confirmSendWithPin(
  userId: string,
  pin: string,
  platform: "whatsapp" | "telegram",
  platformId: string
): Promise<ChatResponse> {
  const session = await getSession(userId);

  if (session.step !== "awaiting_pin_for_send" || !session.pendingCommand) {
    await clearSession(userId);
    return { message: "No pending payment. Start a new one by telling me who and how much to send." };
  }

  // ── Verify PIN ──
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

  // ── PIN verified — execute transfer ──
  const command = session.pendingCommand;
  await clearSession(userId);

  const amountWei = parseEther(command.amount!).toString();

  // Resolve recipient again (idempotent)
  let recipientUserId: string;
  if (command.recipientPhone) {
    const resolved = await resolveUserByPhone(command.recipientPhone, platform, platformId);
    recipientUserId = resolved.userId;
  } else if (command.recipientName) {
    const resolved = await resolveContactByName(userId, command.recipientName);
    if (!resolved) {
      return { message: "That contact doesn't exist anymore. Try again with a phone number." };
    }
    recipientUserId = resolved;
  } else {
    return { message: "Something's off with that transfer. Please start over." };
  }

  const refId = generateRefId();
  const idempotencyKey = buildIdempotencyKey(userId, recipientUserId, amountWei);

  // Enqueue the transfer job
  const job: TxSubmitJob = {
    refId,
    senderUserId: userId,
    recipientUserId,
    amount: amountWei,
    txType: "transfer",
    idempotencyKey,
  };

  await enqueueTxSubmit(job);

  const recipientLabel = command.recipientName || `****${command.recipientPhone?.slice(-4)}`;

  logger.info({ userId, refId }, "Transfer enqueued");

  return {
    message: `Sending *${command.amount} MON* to ${recipientLabel}... ⚡\n\nI'll let you know when it's confirmed.`,
  };
}
