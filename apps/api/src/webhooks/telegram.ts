import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { verifyTelegramSecret } from "../middleware/webhookAuth.js";
import { routeCommand } from "../commands/router.js";
import type { UnifiedMessage } from "@chatpay/shared";

// ──────────────────────── Types ─────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
    contact?: {
      phone_number: string;
      first_name: string;
      user_id?: number;
    };
  };
}

// ──────────────────────── Webhook Route ─────────────────────────

export async function registerTelegramWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Body: TelegramUpdate }>(
    "/webhooks/telegram",
    async (req: FastifyRequest<{ Body: TelegramUpdate }>, reply: FastifyReply) => {
      // Verify secret
      if (!verifyTelegramSecret(req)) {
        logger.warn("Invalid Telegram webhook secret");
        return reply.status(403).send({ error: "Invalid secret" });
      }

      const update = req.body;
      const message = update.message;

      if (!message) {
        return reply.status(200).send({ ok: true });
      }

      const chatId = message.chat.id.toString();
      const userId = message.from.id.toString();

      // Handle contact sharing (phone number)
      if (message.contact) {
        const phoneNumber = message.contact.phone_number.startsWith("+")
          ? message.contact.phone_number
          : `+${message.contact.phone_number}`;

        const msg: UnifiedMessage = {
          platform: "telegram",
          platformUserId: userId,
          phoneNumber,
          messageText: "register", // treat contact share as registration
          timestamp: new Date(message.date * 1000).toISOString(),
          chatId,
        };

        const response = await routeCommand(msg);
        await sendTelegramMessage(chatId, response.message);
        return reply.status(200).send({ ok: true });
      }

      // Handle text messages
      const text = message.text?.trim();
      if (!text) {
        return reply.status(200).send({ ok: true });
      }

      // Look up phone number from existing user
      // (Telegram doesn't send phone with every message)
      const { prisma } = await import("../config/database.js");
      const existingUser = await prisma.user.findFirst({
        where: { platformId: userId, platform: "telegram" },
        select: { phoneHash: true, phoneLast4: true },
      });

      let phoneNumber: string | null = null;
      if (existingUser) {
        // User exists — we don't need the actual phone number for routing,
        // the platformId is enough to identify them.
        // We pass a synthetic phone for the resolver.
        phoneNumber = `tg_${userId}`;
      }

      if (!phoneNumber) {
        // New user — request phone number
        await sendTelegramContactRequest(chatId);
        return reply.status(200).send({ ok: true });
      }

      const msg: UnifiedMessage = {
        platform: "telegram",
        platformUserId: userId,
        phoneNumber,
        messageText: text,
        timestamp: new Date(message.date * 1000).toISOString(),
        chatId,
      };

      const response = await routeCommand(msg);
      await sendTelegramMessage(chatId, response.message);

      return reply.status(200).send({ ok: true });
    }
  );
}

// ──────────────────────── Send Messages ─────────────────────────

const TELEGRAM_API_BASE = "https://api.telegram.org";

async function telegramApi(method: string, body: Record<string, unknown>): Promise<unknown> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn("Telegram bot token not configured");
    return;
  }

  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${text}`);
  }

  return response.json();
}

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

async function sendTelegramContactRequest(chatId: string): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "📱 Welcome to Monad Pay!\n\nPlease share your phone number to get started.",
    reply_markup: {
      keyboard: [
        [
          {
            text: "📱 Share Phone Number",
            request_contact: true,
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}
