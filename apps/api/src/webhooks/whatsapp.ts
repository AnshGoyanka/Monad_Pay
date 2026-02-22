import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Twilio from "twilio";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { verifyTwilioSignature } from "../middleware/webhookAuth.js";
import { routeCommand } from "../commands/router.js";
import type { UnifiedMessage } from "@chatpay/shared";

// ──────────────────────── Twilio Client ─────────────────────────

let twilioClient: ReturnType<typeof Twilio> | null = null;

function getTwilioClient(): ReturnType<typeof Twilio> {
  if (!twilioClient && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    twilioClient = Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  if (!twilioClient) {
    throw new Error("Twilio not configured");
  }
  return twilioClient;
}

// ──────────────────────── Webhook Route ─────────────────────────

interface WhatsAppBody {
  From: string;       // "whatsapp:+91XXXXXXXXXX"
  Body: string;
  To: string;
  MessageSid: string;
  AccountSid: string;
}

export async function registerWhatsAppWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Body: WhatsAppBody }>(
    "/webhooks/whatsapp",
    {},
    // Note: body is parsed via our custom URL-encoded parser in index.ts
    async (req: FastifyRequest<{ Body: WhatsAppBody }>, reply: FastifyReply) => {
      // Verify signature
      if (!verifyTwilioSignature(req, reply)) {
        logger.warn("Invalid Twilio signature");
        return reply.status(403).send({ error: "Invalid signature" });
      }

      const body = req.body;

      // Parse WhatsApp phone number: "whatsapp:+91XXXXXXXXXX" → "+91XXXXXXXXXX"
      const phoneNumber = body.From.replace("whatsapp:", "");
      const messageText = body.Body?.trim() || "";

      if (!messageText) {
        return reply.status(200).send(); // Ignore empty messages
      }

      const msg: UnifiedMessage = {
        platform: "whatsapp",
        platformUserId: phoneNumber,
        phoneNumber,
        messageText,
        timestamp: new Date().toISOString(),
        chatId: phoneNumber,
      };

      // Route command
      logger.info({ phoneNumber }, "Routing command...");
      let response: { message: string; expectingReply?: boolean };
      try {
        response = await routeCommand(msg);
        logger.info({ responseLength: response.message?.length, preview: response.message?.slice(0, 80) }, "routeCommand returned");
      } catch (routeErr) {
        logger.error({ err: routeErr }, "routeCommand threw");
        response = { message: "❌ Something went wrong. Please try again." };
      }

      // Reply via Twilio
      try {
        logger.info({ to: phoneNumber, from: env.TWILIO_WHATSAPP_NUMBER, bodyLen: response.message.length }, "Sending Twilio message...");
        await sendWhatsAppMessage(phoneNumber, response.message);
        logger.info("WhatsApp reply sent successfully");
      } catch (error: any) {
        logger.error({ err: error, code: error?.code, status: error?.status, moreInfo: error?.moreInfo, message: error?.message }, "Failed to send WhatsApp reply");
      }

      return reply.status(200).send();
    }
  );
}

// ──────────────────────── Send Message ──────────────────────────

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    logger.warn("Twilio not configured, message not sent");
    return;
  }

  const client = getTwilioClient();

  await client.messages.create({
    from: env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${to}`,
    body: message,
  });
}
