import { Worker, type Job } from "bullmq";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { QUEUE_TX_SUBMIT } from "@chatpay/shared";
import type { TxSubmitJob } from "@chatpay/shared";
import { processTransfer } from "../../services/payment.js";
import { enqueueTxConfirm, enqueueNotify } from "../producers.js";
import { prisma } from "../../config/database.js";

/**
 * TX Submit Worker
 *
 * Processes transfer jobs:
 * 1. Decrypt addresses
 * 2. Call PaymentPool.transfer() via relayer
 * 3. Record transaction
 * 4. Enqueue confirmation polling
 * 5. Send initial notification
 */
export function createTxSubmitWorker(): Worker<TxSubmitJob> {
  const worker = new Worker<TxSubmitJob>(
    QUEUE_TX_SUBMIT,
    async (job: Job<TxSubmitJob>) => {
      const { refId, senderUserId, recipientUserId } = job.data;
      logger.info({ refId, jobId: job.id }, "Processing transfer");

      try {
        const result = await processTransfer(job.data);

        if (result.txHash) {
          // Get the transaction record for the confirm job
          const tx = await prisma.transaction.findUnique({
            where: { refId },
            select: { id: true },
          });

          if (tx) {
            // Enqueue confirmation polling
            await enqueueTxConfirm({
              refId,
              txHash: result.txHash,
              transactionId: tx.id,
            });
          }

          // Get sender and recipient info for notifications
          const [sender, recipient] = await Promise.all([
            prisma.user.findUnique({
              where: { id: senderUserId },
              select: { platform: true, platformId: true, phoneLast4: true },
            }),
            prisma.user.findUnique({
              where: { id: recipientUserId },
              select: { platform: true, platformId: true, phoneLast4: true },
            }),
          ]);

          // Notify sender
          if (sender) {
            const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.txHash}`;
            await enqueueNotify({
              platform: sender.platform as "whatsapp" | "telegram",
              chatId: sender.platformId,
              message: `⏳ Payment of *${result.amount} MON* submitted. Waiting for confirmation...\n\n🔗 Track: ${explorerUrl}`,
            });
          }
        }

        logger.info({ refId, txHash: result.txHash }, "Transfer processed");
      } catch (error) {
        logger.error({ err: error, refId }, "Transfer processing failed");

        // Notify sender of failure
        const sender = await prisma.user.findUnique({
          where: { id: senderUserId },
          select: { platform: true, platformId: true },
        });

        if (sender) {
          await enqueueNotify({
            platform: sender.platform as "whatsapp" | "telegram",
            chatId: sender.platformId,
            message: `❌ Payment failed. Your balance is unchanged.\n\nRef: ${refId.slice(0, 8)}`,
          });
        }

        throw error; // BullMQ will retry
      }
    },
    {
      connection: redis as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // max 10 tx/s
      },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "TX submit job failed");
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "TX submit job completed");
  });

  return worker;
}
