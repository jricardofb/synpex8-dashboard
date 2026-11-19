import type { FastifyPluginAsync } from 'fastify';
import { routeErrorHandler, type PrismaOptions } from './routeUtils.js';

export const accountsRoutes: FastifyPluginAsync<PrismaOptions> = async (app, { prisma }) => {
  app.setErrorHandler(routeErrorHandler('ACCOUNTS_QUERY_FAILED'));

  app.get('/api/v1/accounts', async () => {
    const rows = await prisma.account.findMany({ orderBy: { createdAt: 'desc' } });
    return {
      data: rows.map((a) => {
        const freeMargin = Number(a.freeMargin ?? 0);
        const reservedMargin = Number(a.reservedMargin ?? 0);
        return {
          id: String(a.id),
          broker: a.broker,
          active: a.active,
          freeMargin,
          reservedMargin,
          usableMargin: freeMargin - reservedMargin,
        };
      }),
    };
  });

  app.get('/api/v1/clients', async () => ({
    data: await prisma.client.findMany({ orderBy: { createdAt: 'desc' } }),
  }));

  app.get('/api/v1/masters', async () => ({
    data: await prisma.master.findMany({
      select: { id: true, externalId: true, active: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  }));

  app.get('/api/v1/universal-assets', async () => ({
    data: await prisma.universalAsset.findMany({ orderBy: { code: 'asc' } }),
  }));
};
