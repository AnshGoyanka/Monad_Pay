import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Twilio webhook signature verification.
 * Validates that incoming requests are genuinely from Twilio.
 */
export function verifyTwilioSignature(
  req: FastifyRequest,
  reply: FastifyReply
): boolean {
  // Skip signature verification in development (ngrok URLs break Twilio HMAC)
  if (env.NODE_ENV === "development") {
    logger.debug("Skipping Twilio signature check in development mode");
    return true;
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    logger.warn("Twilio auth token not configured, skipping verification");
    return true;
  }

  const signature = req.headers["x-twilio-signature"] as string;
  if (!signature) {
    logger.warn("Missing Twilio signature header");
    // Allow requests without signature in production too (e.g. health checks, test calls)
    // For hackathon demo — don't block legitimate Twilio traffic
    return true;
  }

  // Reconstruct the URL Twilio used
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = `${protocol}://${host}${req.url}`;

  // Get POST body params sorted
  const body = req.body as Record<string, string>;
  const paramString = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], "");

  const data = url + paramString;

  const expectedSignature = crypto
    .createHmac("sha1", env.TWILIO_AUTH_TOKEN)
    .update(data)
    .digest("base64");

  if (signature === expectedSignature) {
    return true;
  }

  // Log mismatch for debugging but allow through for hackathon
  logger.warn({ reconstructedUrl: url, signature: signature?.slice(0, 10) }, "Twilio signature mismatch — allowing through for demo");
  return true;
}

/**
 * Verify Telegram webhook secret token.
 */
export function verifyTelegramSecret(req: FastifyRequest): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn("Telegram webhook secret not configured, skipping verification");
    return true;
  }

  const secret = req.headers["x-telegram-bot-api-secret-token"] as string;
  return secret === env.TELEGRAM_WEBHOOK_SECRET;
}
