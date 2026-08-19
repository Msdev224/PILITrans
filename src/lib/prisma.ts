import { PrismaClient } from "@prisma/client";

// Singleton : en développement, le hot-reload de Next recrée les modules à
// chaque changement — sans cache global on ouvrirait une connexion par reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
