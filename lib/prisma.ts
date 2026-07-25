import { PrismaClient } from "@prisma/client";

import { env } from "./env";

/**
 * Prisma client singleton.
 *
 * In development, Next.js hot-reloads modules on every file change,
 * which would otherwise create a new PrismaClient (and a new DB
 * connection pool) on every reload. Caching the instance on
 * `globalThis` avoids exhausting the database connection limit.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
