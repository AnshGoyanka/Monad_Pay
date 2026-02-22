import { Worker, type Job, UnrecoverableError } from "bullmq";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { QUEUE_TX_CONFIRM } from "@chatpay/shared";
import type { TxConfirmJob } from "@chatpay/shared";
import { confirmTransaction } from "../../services/payment.js";
import { enqueueNotify } from "../producers.js";
import { prisma } from "../../config/database.js";

/**
 * TX Confirm Worker
 *
 * Polls for transaction receipts.
 * On confirmation/failure, notifies both sender and recipient.
 */
export function createTxConfirmWorker(): Worker<TxConfirmJob> {
  const worker = new Worker<TxConfirmJob>(
    QUEUE_TX_CONFIRM,
    async (job: Job<TxConfirmJob>) => {
      const { refId, txHash, transactionId } = job.data;
      logger.debug({ refId, attempt: job.attemptsMade }, "Checking confirmation");

      const status = await confirmTransaction(txHash, transactionId);

      if (status === "pending") {
        // Not yet confirmed — throw to retry
        throw new Error("Transaction still pending");
      }

      // Transaction finalized — send notifications
      const tx = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          sender: { select: { platform: true, platformId: true, phoneLast4: true } },
          recipient: { select: { platform: true, platformId: true, phoneLast4: true } },
        },
      });

      if (!tx) return;

      const amount = tx.amount.toString();
      const explorerUrl = `https://testnet.monadexplorer.com/tx/${txHash}`;

      if (status === "confirmed") {
        // Notify sender
        await enqueueNotify({
          platform: tx.sender.platform as "whatsapp" | "telegram",
          chatId: tx.sender.platformId,
          message: `✅ *${amount} MON* sent to ****${tx.recipient.phoneLast4 || "???"}!\n\n🔗 Verify: ${explorerUrl}`,
        });

        // Recipient notification disabled in sandbox mode
        // (In sandbox, both users share the same Twilio chat thread)
        // TODO: Re-enable in production with dedicated WhatsApp Business number
        // await enqueueNotify({
        //   platform: tx.recipient.platform as "whatsapp" | "telegram",
        //   chatId: tx.recipient.platformId,
        //   message: `💰 You received *${amount} MON* from ****${tx.sender.phoneLast4 || "???"}.\n\nType *balance* to check your funds.`,
        // });
      } else if (status === "failed") {
        // Notify sender
        await enqueueNotify({
          platform: tx.sender.platform as "whatsapp" | "telegram",
          chatId: tx.sender.platformId,
          message: `❌ Payment of *${amount} MON* failed on-chain. Your balance is unchanged.\n\n🔗 Details: ${explorerUrl}`,
        });
      }

      logger.info({ refId, status }, "Transaction confirmed/failed");
    },
    {
      connection: redis as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      concurrency: 10,
    }
  );

  worker.on("failed", (job, err) => {
    if (job && job.attemptsMade >= 20) {
      logger.error({ jobId: job.id }, "TX confirm exhausted retries — marking expired");
      // Mark as expired after max attempts
      prisma.transaction
        .update({
          where: { id: job.data.transactionId },
          data: { status: "expired", errorMessage: "Confirmation timed out" },
        })
        .catch((e) => logger.error({ err: e }, "Failed to mark tx as expired"));
    }
  });

  return worker;
}
