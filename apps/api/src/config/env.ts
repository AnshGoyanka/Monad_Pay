import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Encryption
  MASTER_ENCRYPTION_KEY: z.string().min(64, "Master key must be 64 hex chars (32 bytes)"),
  PHONE_HASH_SALT: z.string().min(16, "Phone hash salt must be at least 16 chars"),

  // Blockchain
  MONAD_RPC_URL: z.string().url(),
  PAYMENT_POOL_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid contract address"),
  HD_MNEMONIC: z.string().refine(
    (val) => val.split(" ").length === 12 || val.split(" ").length === 24,
    "Mnemonic must be 12 or 24 words"
  ),

  // Twilio (WhatsApp)
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_WHATSAPP_NUMBER: z.string().default(""),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(formatted, null, 2));
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
