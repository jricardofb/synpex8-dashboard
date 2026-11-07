import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  assertCopyTradingRouteAssetsCompatible,
  PrismaCopyTradingRouteRepository,
} from './services/copyTradingRoutes.js';

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
});

const argsSchema = z.tuple([
  z.string().trim().min(1).max(128),
  z.string().trim().min(1).max(128),
  z.string().trim().min(1).max(128),
  z.string().trim().min(1).max(128),
  z.string().trim().min(1),
  z.string().trim().min(1).max(128),
]);

async function provisionCopyTradingRoute(): Promise<void> {
  const parsedArgs = argsSchema.safeParse(process.argv.slice(2));
  if (!parsedArgs.success) {
    throw new Error('Usage: npx tsx src/provisionCopyTradingRoute.ts <MASTER_EXTERNAL_ID> <SOURCE_ROBOT_ID> <STRATEGY_ID> <CLIENT_EXTERNAL_ID> <BROKER_ACCOUNT_ID> <CLIENT_ROBOT_EXTERNAL_ID>');
  }

  const [masterExternalId, sourceRobotId, strategyId, clientExternalId, brokerAccountId, clientRobotExternalId] = parsedArgs.data;
  const config = environmentSchema.parse(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });

  try {
    const [master, client, brokerAccount, robot] = await Promise.all([
      prisma.master.findUnique({ where: { externalId: masterExternalId }, select: { id: true } }),
      prisma.client.findUnique({ where: { externalId: clientExternalId }, select: { id: true } }),
      prisma.brokerAccount.findUnique({ where: { id: brokerAccountId }, select: { id: true, clientId: true } }),
      prisma.robot.findUnique({ where: { externalId: clientRobotExternalId }, select: { id: true, clientId: true } }),
    ]);

    if (!master) throw new Error(`Master ${masterExternalId} was not found`);
    if (!client) throw new Error(`Client ${clientExternalId} was not found`);
    if (!brokerAccount || brokerAccount.clientId !== client.id) {
      throw new Error(`Broker account ${brokerAccountId} does not belong to client ${clientExternalId}`);
    }
    if (!robot || robot.clientId !== client.id) {
      throw new Error(`Robot ${clientRobotExternalId} is not assigned to client ${clientExternalId}`);
    }

    const assetValidation = await new PrismaCopyTradingRouteRepository(prisma)
      .validateRouteAssets(master.id, brokerAccount.id);
    assertCopyTradingRouteAssetsCompatible(assetValidation);

    await prisma.copyTradingRoute.upsert({
      where: {
        masterId_sourceRobotId_strategyId_brokerAccountId: {
          masterId: master.id,
          sourceRobotId,
          strategyId,
          brokerAccountId: brokerAccount.id,
        },
      },
      create: {
        masterId: master.id,
        sourceRobotId,
        strategyId,
        clientId: client.id,
        brokerAccountId: brokerAccount.id,
        robotId: robot.id,
      },
      update: {
        clientId: client.id,
        robotId: robot.id,
        active: true,
      },
    });

    process.stdout.write(`Copy route saved: ${masterExternalId}/${sourceRobotId}/${strategyId} -> ${clientExternalId}/${brokerAccount.id}/${clientRobotExternalId}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

provisionCopyTradingRoute().catch((error: unknown) => {
  process.stderr.write(`Copy route provisioning failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
