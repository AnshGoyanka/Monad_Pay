import { Queue } from "bullmq";
import { redis } from "../config/redis.js";
import { QUEUE_TX_SUBMIT, QUEUE_TX_CONFIRM, QUEUE_NOTIFY } from "@chatpay/shared";
import type { TxSubmitJob, TxConfirmJob, NotifyJob } from "@chatpay/shared";

// Cast redis to satisfy BullMQ's bundled ioredis types
const conn = redis as any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ──────────────────────── Queue Instances ────────────────────────

const txSubmitQueue = new Queue(QUEUE_TX_SUBMIT, {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

const txConfirmQueue = new Queue(QUEUE_TX_CONFIRM, {
  connection: conn,
  defaultJobOptions: {
    attempts: 20, // poll up to 20 times
    backoff: { type: "fixed", delay: 3000 }, // every 3s
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

const notifyQueue = new Queue(QUEUE_NOTIFY, {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 5000 },
  },
});

// ──────────────────────── Producers ─────────────────────────────

export async function enqueueTxSubmit(job: TxSubmitJob): Promise<void> {
  await txSubmitQueue.add("transfer", job, {
    jobId: job.idempotencyKey, // prevents duplicate jobs
  });
}

export async function enqueueTxConfirm(job: TxConfirmJob): Promise<void> {
  await txConfirmQueue.add("confirm", job);
}

export async function enqueueNotify(job: NotifyJob): Promise<void> {
  await notifyQueue.add("notify", job);
}

// ──────────────────────── Cleanup ───────────────────────────────

export async function closeQueues(): Promise<void> {
  await txSubmitQueue.close();
  await txConfirmQueue.close();
  await notifyQueue.close();
}
