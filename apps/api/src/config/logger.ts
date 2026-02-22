import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  // SECURITY: never log addresses or keys
  redact: {
    paths: [
      "address",
      "privateKey",
      "encryptedKey",
      "pin",
      "pinHash",
      "phoneNumber",
      "req.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});
