import { redis } from "../config/redis.js";
import type { UserSession, SessionStep, ParsedCommand } from "@chatpay/shared";
import { SESSION_TTL_MS } from "@chatpay/shared";

const SESSION_PREFIX = "session:";

/**
 * Redis-backed session manager for multi-step chat flows.
 * Sessions expire after SESSION_TTL_MS to prevent stale state.
 */

export async function getSession(userId: string): Promise<UserSession> {
  const raw = await redis.get(`${SESSION_PREFIX}${userId}`);
  if (!raw) {
    return { step: "idle", expiresAt: 0 };
  }

  const session = JSON.parse(raw) as UserSession;

  // Check expiry
  if (Date.now() > session.expiresAt) {
    await clearSession(userId);
    return { step: "idle", expiresAt: 0 };
  }

  return session;
}

export async function setSession(
  userId: string,
  step: SessionStep,
  data?: Partial<Pick<UserSession, "pendingCommand" | "pinSetupValue">>
): Promise<void> {
  const session: UserSession = {
    step,
    pendingCommand: data?.pendingCommand,
    pinSetupValue: data?.pinSetupValue,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  await redis.set(
    `${SESSION_PREFIX}${userId}`,
    JSON.stringify(session),
    "PX",
    SESSION_TTL_MS
  );
}

export async function clearSession(userId: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${userId}`);
}
