import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log:
    env.NODE_ENV === "development"
      ? [
          { emit: "event", level: "query" },
          { emit: "event", level: "error" },
        ]
      : [{ emit: "event", level: "error" }],
});

if (env.NODE_ENV === "development") {
  prisma.$on("query" as never, (e: unknown) => {
    logger.debug(e, "prisma:query");
  });
}

prisma.$on("error" as never, (e: unknown) => {
  logger.error(e, "prisma:error");
});

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
