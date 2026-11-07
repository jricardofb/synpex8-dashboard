import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { encryptMasterSecret, validateMasterSecretEncryptionKey } from '../src/signals/security.js';

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
  MASTER_SECRET_ENCRYPTION_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

async function seed(): Promise<void> {
  const config = environmentSchema.parse(process.env);
  if (config.NODE_ENV === 'production') throw new Error('Refusing to seed a production environment');
  validateMasterSecretEncryptionKey(config.MASTER_SECRET_ENCRYPTION_KEY);

  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });
  let generatedMasterSecret: string | undefined;

  try {
    await prisma.$transaction(async (transaction) => {
      const client = await transaction.client.upsert({
        where: { externalId: 'DEV-CLIENT-1' },
        create: { externalId: 'DEV-CLIENT-1', name: 'Development Client' },
        update: {},
        select: { id: true },
      });

      const brokerAccount = await transaction.brokerAccount.upsert({
        where: { clientId_accountNumber: { clientId: client.id, accountNumber: 'MOCK-DEV-1' } },
        create: {
          clientId: client.id,
          broker: 'MOCK',
          accountNumber: 'MOCK-DEV-1',
          active: true,
          balance: 10_000,
          equity: 10_000,
          freeMargin: 10_000,
          usedMargin: 0,
        },
        update: {},
        select: { id: true },
      });

      const robot = await transaction.robot.upsert({
        where: { externalId: 'DEV-ROBOT-1' },
        create: {
          externalId: 'DEV-ROBOT-1',
          clientId: client.id,
          name: 'Development Robot',
          configuredVolume: 0.01,
          status: 'OFF',
        },
        update: {},
        select: { id: true, clientId: true },
      });
      if (robot.clientId !== client.id) throw new Error('DEV-ROBOT-1 is assigned to another client');

      const existingMaster = await transaction.master.findUnique({
        where: { externalId: 'MASTER-1' },
        select: { id: true },
      });
      const masterSecret = existingMaster ? undefined : randomBytes(32).toString('base64url');
      const master = existingMaster
        ? existingMaster
        : await transaction.master.create({
            data: {
              externalId: 'MASTER-1',
              encryptedSecret: encryptMasterSecret(masterSecret!, config.MASTER_SECRET_ENCRYPTION_KEY, 'MASTER-1'),
            },
            select: { id: true },
          });
      generatedMasterSecret = masterSecret;

      const asset = await transaction.universalAsset.upsert({
        where: { code: 'GOLD' },
        create: { code: 'GOLD', displayName: 'Gold' },
        update: {},
        select: { id: true },
      });

      await transaction.masterAssetMapping.upsert({
        where: { masterId_normalizedSourceSymbol: { masterId: master.id, normalizedSourceSymbol: 'GOLD' } },
        create: {
          masterId: master.id,
          sourceSymbol: 'GOLD',
          normalizedSourceSymbol: 'GOLD',
          universalAssetId: asset.id,
          instrumentType: 'UNKNOWN',
          masterContractSizeOverride: 100,
        },
        update: {},
      });

      await transaction.brokerAssetMapping.upsert({
        where: { brokerAccountId_universalAssetId: { brokerAccountId: brokerAccount.id, universalAssetId: asset.id } },
        create: {
          brokerAccountId: brokerAccount.id,
          universalAssetId: asset.id,
          brokerSymbol: 'XAUUSD',
          normalizedBrokerSymbol: 'XAUUSD',
          instrumentType: 'UNKNOWN',
          contractSize: 100,
          conversionMode: 'EXACT_ONLY',
        },
        update: {},
      });

      await transaction.copyTradingRoute.upsert({
        where: {
          masterId_sourceRobotId_strategyId_brokerAccountId: {
            masterId: master.id,
            sourceRobotId: 'ROBOT-1-1',
            strategyId: 'STRAT-1-1-1',
            brokerAccountId: brokerAccount.id,
          },
        },
        create: {
          masterId: master.id,
          sourceRobotId: 'ROBOT-1-1',
          strategyId: 'STRAT-1-1-1',
          clientId: client.id,
          brokerAccountId: brokerAccount.id,
          robotId: robot.id,
        },
        update: {},
      });
    });
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write('Development fixtures are ready (client/account/robot/master/asset/route). No existing data was deleted.\n');
  if (generatedMasterSecret) {
    process.stdout.write(`Save this one-time development Master signal secret for MASTER-1: ${generatedMasterSecret}\n`);
  } else {
    process.stdout.write('MASTER-1 already existed; its secret was retained and was not displayed.\n');
  }
}

seed().catch((error: unknown) => {
  process.stderr.write(`Database seed failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
