import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma, disconnectDb } from "./config/database.js";
import { redis, disconnectRedis } from "./config/redis.js";
import { initRelayer, getRelayerAddress, isRelayerLowOnGas } from "./services/relayer.js";
import { initNonce } from "./services/nonce.js";
import { registerWhatsAppWebhook } from "./webhooks/whatsapp.js";
import { registerTelegramWebhook } from "./webhooks/telegram.js";
import { createTxSubmitWorker } from "./queue/workers/txSubmitWorker.js";
import { createTxConfirmWorker } from "./queue/workers/txConfirmWorker.js";
import { createNotifyWorker } from "./queue/workers/notifyWorker.js";
import { closeQueues } from "./queue/producers.js";
import { RATE_LIMIT_REQUESTS_PER_MIN } from "@chatpay/shared";
import type { Worker } from "bullmq";

// ──────────────────────── Build App ─────────────────────────────

async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino logger
    trustProxy: true,
  });

  // ── Rate Limiting ──
  await app.register(rateLimit, {
    max: RATE_LIMIT_REQUESTS_PER_MIN,
    timeWindow: "1 minute",
    redis,
    keyGenerator: (req) => {
      // Rate limit by IP or forwarded header
      return (
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip
      );
    },
  });

  // ── Content type parsers ──
  // Twilio sends application/x-www-form-urlencoded
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        const parsed = Object.fromEntries(
          new URLSearchParams(body as string)
        );
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // ── Health Check ──
  app.get("/health", async (req, reply) => {
    try {
      // Check DB
      await prisma.$queryRaw`SELECT 1`;
      // Check Redis
      await redis.ping();

      const lowGas = await isRelayerLowOnGas().catch(() => true);

      return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        relayerGasLow: lowGas,
      });
    } catch (error) {
      return reply.status(503).send({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown",
      });
    }
  });

  // ── Register Webhooks ──
  await registerWhatsAppWebhook(app);
  await registerTelegramWebhook(app);

  return app;
}

// ──────────────────────── Main ──────────────────────────────────

async function main() {
  logger.info("Starting ChatPay Monad API...");

  // ── Initialize relayer ──
  const relayerAccount = initRelayer();
  const relayerAddress = getRelayerAddress();
  logger.info("Relayer initialized");

  // ── Initialize nonce ──
  await initNonce(relayerAddress);
  logger.info("Nonce manager initialized");

  // ── Build Fastify app ──
  const app = await buildApp();

  // ── Start workers ──
  const workers: Worker[] = [
    createTxSubmitWorker(),
    createTxConfirmWorker(),
    createNotifyWorker(),
  ];
  logger.info({ workerCount: workers.length }, "Queue workers started");

  // ── Start server ──
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST }, "Server listening");

  // ── Graceful shutdown ──
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");

    // Stop accepting new connections
    await app.close();

    // Stop workers
    await Promise.all(workers.map((w) => w.close()));

    // Close queues
    await closeQueues();

    // Close DB and Redis
    await disconnectDb();
    await disconnectRedis();

    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
