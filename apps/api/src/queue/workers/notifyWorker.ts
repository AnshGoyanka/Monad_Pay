import { Worker, type Job } from "bullmq";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { QUEUE_NOTIFY } from "@chatpay/shared";
import type { NotifyJob } from "@chatpay/shared";
import { sendWhatsAppMessage } from "../../webhooks/whatsapp.js";
import { sendTelegramMessage } from "../../webhooks/telegram.js";

/**
 * Notification Worker
 *
 * Sends reply messages to users via WhatsApp or Telegram.
 */
export function createNotifyWorker(): Worker<NotifyJob> {
  const worker = new Worker<NotifyJob>(
    QUEUE_NOTIFY,
    async (job: Job<NotifyJob>) => {
      const { platform, chatId, message } = job.data;

      try {
        if (platform === "whatsapp") {
          await sendWhatsAppMessage(chatId, message);
        } else if (platform === "telegram") {
          await sendTelegramMessage(chatId, message);
        }
        logger.debug({ platform, chatId: chatId.slice(0, 4) + "..." }, "Notification sent");
      } catch (error) {
        logger.error({ err: error, platform }, "Failed to send notification");
        throw error; // BullMQ retries
      }
    },
    {
      connection: redis as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      concurrency: 20, // notifications are fast, high concurrency OK
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Notify job failed");
  });

  return worker;
}
