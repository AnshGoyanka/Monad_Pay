import type { UnifiedMessage, ChatResponse, ParsedCommand } from "@chatpay/shared";
import { parseMessage } from "../parser/messageParser.js";
import { resolveUserByPhone } from "../services/contacts.js";
import { createWallet, userHasWallet } from "../services/wallet.js";
import { getSession } from "../services/session.js";
import { prisma } from "../config/database.js";
import { logger } from "../config/logger.js";

// Command handlers
import { handleHelp } from "./help.js";
import { handleBalance } from "./balance.js";
import { handleHistory } from "./history.js";
import { handleSetPin } from "./setPin.js";
import { handleSend, confirmSendWithPin } from "./send.js";
import { handleAddContact } from "./addContact.js";
import { handleDeposit } from "./deposit.js";
import { handleWithdraw, executeWithdrawWithPin } from "./withdraw.js";

/**
 * Main command router — natural language first.
 * Understands casual messages and guides users conversationally.
 */
export async function routeCommand(msg: UnifiedMessage): Promise<ChatResponse> {
  try {
    // ── Step 1: Resolve or register user ──
    if (!msg.phoneNumber) {
      return {
        message: "Hey! I need your phone number to set up your wallet. Could you share it?",
        expectingReply: true,
      };
    }

    const { userId, isNew } = await resolveUserByPhone(
      msg.phoneNumber,
      msg.platform,
      msg.platformUserId
    );

    // Auto-create wallet for new users
    if (isNew || !(await userHasWallet(userId))) {
      await createWallet(userId);

      return {
        message: [
          "Hey! 👋 Welcome to *Monad Pay* — your crypto wallet, right here in WhatsApp.\n",
          "✅ Your wallet is ready. Zero gas fees on every payment.\n",
          "Before you can send money, pick a 4-digit PIN to secure your payments.\n",
          "Just type something like: *my pin is 1234*",
        ].join("\n"),
      };
    }

    // ── Step 2: Check session state (multi-step flows) ──
    const session = await getSession(userId);

    if (session.step === "awaiting_pin_for_send") {
      const parsed = parseMessage(msg.messageText);
      const pin = parsed.pin || msg.messageText.trim();

      if (/^\d{4}$/.test(pin)) {
        if (session.pendingCommand?.type === "withdraw") {
          return executeWithdrawWithPin(userId, pin);
        }
        return confirmSendWithPin(userId, pin, msg.platform, msg.platformUserId);
      }

      return {
        message: "Just type your 4-digit PIN to confirm 🔐",
        expectingReply: true,
      };
    }

    // ── Step 3: Parse command (natural language) ──
    const command = parseMessage(msg.messageText);
    logger.debug({ userId, command: command.type }, "Command parsed");

    // ── Step 4: Route to handler (with smart partial-command handling) ──
    switch (command.type) {
      case "help":
        return handleHelp();

      case "balance":
        return handleBalance(userId);

      case "history":
        return handleHistory(userId);

      case "set_pin":
        if (!command.pin) {
          return {
            message: "Sure! Just tell me your 4-digit PIN.\n\nFor example: *my pin is 4321*",
            expectingReply: true,
          };
        }
        return handleSetPin(userId, command);

      case "send":
        // Handle partial send — missing amount or recipient
        if (!command.amount && !command.recipientPhone && !command.recipientName) {
          return {
            message: "Who do you want to pay, and how much? 💸\n\nJust say something like:\n_send 2 to rahul_\n_pay 5 monad to +919876543210_",
            expectingReply: true,
          };
        }
        if (!command.amount) {
          return {
            message: `How much do you want to send? Just tell me the amount 💰`,
            expectingReply: true,
          };
        }
        if (!command.recipientPhone && !command.recipientName) {
          return {
            message: `Got it — *${command.amount} MON*. Who should I send it to?\n\nSend a name or phone number.`,
            expectingReply: true,
          };
        }
        return handleSend(userId, command, msg.platform, msg.platformUserId);

      case "add_contact":
        if (!command.contactName || !command.contactPhone) {
          return {
            message: "I can save a contact for you! Just say:\n_save rahul +919876543210_",
            expectingReply: true,
          };
        }
        return handleAddContact(userId, command);

      case "deposit":
        return handleDeposit(userId);

      case "withdraw":
        if (!command.amount) {
          return {
            message: "How much would you like to withdraw? 🏧\n\nJust say: _withdraw 5 monad_",
            expectingReply: true,
          };
        }
        return handleWithdraw(userId, command);

      case "unknown":
      default:
        return {
          message: "Hmm, I didn't quite get that 🤔\n\nYou can say things like:\n• _send 2 monad to rahul_\n• _what's my balance_\n• _show my transactions_\n\nOr just say *hi* to see everything I can do.",
        };
    }
  } catch (error) {
    logger.error({ err: error, platform: msg.platform }, "Command routing error");
    return {
      message: "Oops, something went wrong on my end. Give it another try? 🙏",
    };
  }
}
