import type { ParsedCommand, ChatResponse } from "@chatpay/shared";
import { isValidPin, hashPin } from "../security/pinAuth.js";
import { prisma } from "../config/database.js";
import { logger } from "../config/logger.js";
import { setSession, clearSession } from "../services/session.js";

/**
 * Set PIN command — sets the user's 4-digit transaction PIN.
 */
export async function handleSetPin(
  userId: string,
  command: ParsedCommand
): Promise<ChatResponse> {
  const pin = command.pin;

  if (!pin || !isValidPin(pin)) {
    return {
      message: "That doesn't look like a valid PIN. I need exactly 4 digits.\n\nTry: _my pin is 4321_",
    };
  }

  // Check if user already has a PIN
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true },
  });

  if (user?.pinHash) {
    return {
      message: "You've already set a PIN 🔑 It's locked in and secure.",
    };
  }

  // Hash and store
  const pinH = await hashPin(pin);
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash: pinH, status: "active" },
  });

  await clearSession(userId);

  logger.info({ userId }, "PIN set successfully");

  return {
    message: "PIN set! ✅ You're all set to send payments.\n\nTry: _send 1 monad to +91..._",
  };
}
