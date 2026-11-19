import type { FastifyPluginAsync } from 'fastify';
import type { Redis } from 'ioredis';
import { routeErrorHandler, type PrismaOptions } from './routeUtils.js';

type Opts = PrismaOptions & { redisClient: Redis };

export const dashboardRoutes: FastifyPluginAsync<Opts> = async (app, { prisma, redisClient }) => {
  app.setErrorHandler(routeErrorHandler('DASHBOARD_QUERY_FAILED'));

  app.get('/api/v1/dashboard/summary', async () => {
    const since = new Date(Date.now() - 86_400_000);
    const [masters, routes, signals24h, robotGroups, signalsTotal, signalsPending, openPositions] =
      await Promise.all([
        prisma.master.count(),
        prisma.copyTradingRoute.count(),
        prisma.masterSignal.count({ where: { createdAt: { gte: since } } }),
        prisma.robot.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.masterSignal.count(),
        prisma.signalOutbox.count({ where: { status: 'PENDING' } }),
        prisma.position.count({ where: { state: 'OPEN' } }),
      ]);

    const robotsTotal = robotGroups.reduce((s, g) => s + g._count._all, 0);
    const robotsOn = robotGroups.find((g) => g.status === 'ON')?._count._all ?? 0;

    return {
      data: {
        mode: 'DRY_RUN',
        masters,
        routes,
        robots: { total: robotsTotal, on: robotsOn, off: robotsTotal - robotsOn },
        signals: { total: signalsTotal, pending: signalsPending, last24h: signals24h },
        positions: { open: openPositions },
      },
    };
  });

  app.get('/api/v1/robots', async () => ({
    data: await prisma.robot.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, externalId: true, name: true, status: true,
        configuredVolume: true, createdAt: true, updatedAt: true,
      },
    }),
  }));

  app.get('/api/v1/signals', async () => ({
    data: await prisma.masterSignal.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
  }));

  app.get('/api/v1/health', async () => {
    const check = (fn: () => Promise<unknown>) =>
      fn().then(() => 'ok' as const).catch(() => 'down' as const);
    const [postgres, redis] = await Promise.all([
      check(() => prisma.$queryRaw`SELECT 1`),
      check(() => redisClient.ping()),
    ]);
    return { data: { api: 'ok', postgres, redis } };
  });
};
