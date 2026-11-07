import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client"; // mesmo import do api.ts
import type { Redis } from "ioredis";

type Opts = { prisma: PrismaClient; redisClient: Redis };

export const dashboardRoutes: FastifyPluginAsync<Opts> = async (
  app,
  { prisma, redisClient },
) => {
  app.get("/dashboard/summary", async () => {
    const [masters, routes, signals24h] = await Promise.all([
      prisma.master.count(),
      prisma.copyTradingRoute.count(),
      prisma.masterSignal.count({
        where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
    ]);
    return { masters, routes, signals24h, mode: "dry-run" };
  });

  app.get("/health", async () => {
    const check = (fn: () => Promise<unknown>) =>
      fn().then(() => "ok" as const).catch(() => "down" as const);

    const [postgres, redis] = await Promise.all([
      check(() => prisma.$queryRaw`SELECT 1`),
      check(() => redisClient.ping()),
    ]);

    return { api: "ok", postgres, redis };
  });
};