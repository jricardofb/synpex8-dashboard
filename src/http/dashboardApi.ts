import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

interface DashboardApiDependencies {
  prisma: PrismaClient;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  { prisma }: DashboardApiDependencies,
): Promise<void> {

  // ------------------------------------------------------------------
  // 1. Resumo do Dashboard
  // ------------------------------------------------------------------
  app.get('/api/v1/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Uso de groupBy para consolidar duas queries de robôs em apenas uma viagem ao banco
      const [robotGroups, signalsTotal, signalsPending, openPositions] = await Promise.all([
        prisma.robot.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.masterSignal.count(),
        prisma.signalOutbox.count({
          where: { status: 'PENDING' },
        }),
        prisma.position.count({
          where: { state: 'OPEN' },
        }),
      ]);

      // Processa a contagem de robôs em memória
      let robotsOn = 0;
      let robotsTotal = 0;

      for (const group of robotGroups) {
        const count = group._count._all;
        robotsTotal += count;
        if (group.status === 'ON') {
          robotsOn = count;
        }
      }

      return reply.code(200).send({
        mode: 'DRY_RUN',
        robots: {
          total: robotsTotal,
          on: robotsOn,
          off: robotsTotal - robotsOn,
        },
        signals: {
          total: signalsTotal,
          pending: signalsPending,
        },
        positions: {
          open: openPositions,
        },
      });
    } catch (error) {
      request.log.error(
        { err: error },
        'Failed to load dashboard summary',
      );

      return reply.code(500).send({
        error: 'DASHBOARD_QUERY_FAILED',
        message: 'Internal server error while fetching metrics',
      });
    }
  });

  // ------------------------------------------------------------------
  // 2. Lista de Robôs
  // ------------------------------------------------------------------
  app.get('/api/v1/robots', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const robots = await prisma.robot.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          externalId: true,
          name: true,
          status: true,
          configuredVolume: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.code(200).send({
        data: robots,
      });
    } catch (error) {
      request.log.error(
        { err: error },
        'Failed to list robots',
      );

      return reply.code(500).send({
        error: 'ROBOTS_QUERY_FAILED',
        message: 'Internal server error while fetching robots list',
      });
    }
  });
}