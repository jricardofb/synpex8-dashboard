import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { normalizeAssetSymbol } from './services/assetMapping.js';

const positiveNumber = z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).refine(Number.isFinite).refine((value) => value > 0);
const instrumentType = z.enum(['SPOT', 'CFD', 'FUTURE', 'OPTION', 'STOCK', 'ETF', 'CRYPTO_SPOT']);
const conversionMode = z.enum(['EXACT_ONLY', 'CONTRACT_SIZE_RATIO']);

const argsSchema = z.tuple([
  z.string().trim().min(1).max(128),
  z.string().trim().min(1).max(64),
  z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_.-]{0,63}$/),
  z.string().trim().min(1).max(128),
  positiveNumber,
  instrumentType,
  z.string().trim().min(1),
  z.string().trim().min(1).max(64),
  positiveNumber,
  instrumentType,
  conversionMode,
]);

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
});

async function provisionAssetMapping(): Promise<void> {
  const parsedArgs = argsSchema.safeParse(process.argv.slice(2));
  if (!parsedArgs.success) {
    throw new Error(
      'Usage: npx tsx src/provisionAssetMapping.ts <MASTER_ID> <MASTER_SYMBOL> <UNIVERSAL_CODE> <DISPLAY_NAME> <MASTER_CONTRACT_SIZE> <MASTER_INSTRUMENT_TYPE> <BROKER_ACCOUNT_ID> <BROKER_SYMBOL> <BROKER_CONTRACT_SIZE> <BROKER_INSTRUMENT_TYPE> <CONVERSION_MODE>',
    );
  }

  const [
    masterExternalId,
    masterSymbol,
    assetCode,
    displayName,
    masterContractSize,
    masterInstrumentType,
    brokerAccountId,
    brokerSymbol,
    brokerContractSize,
    brokerInstrumentType,
    brokerConversionMode,
  ] = parsedArgs.data;
  const config = environmentSchema.parse(process.env);
  const normalizedMasterSymbol = normalizeAssetSymbol(masterSymbol);
  const normalizedBrokerSymbol = normalizeAssetSymbol(brokerSymbol);
  if (!normalizedMasterSymbol || !normalizedBrokerSymbol) throw new Error('Asset symbols must not be empty');

  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });

  try {
    await prisma.$transaction(async (transaction) => {
      const master = await transaction.master.findUnique({
        where: { externalId: masterExternalId },
        select: { id: true },
      });
      if (!master) throw new Error(`Master ${masterExternalId} was not found`);

      const asset = await transaction.universalAsset.upsert({
        where: { code: assetCode },
        create: { code: assetCode, displayName },
        update: { displayName },
        select: { id: true },
      });

      await transaction.masterAssetMapping.upsert({
        where: { masterId_normalizedSourceSymbol: { masterId: master.id, normalizedSourceSymbol: normalizedMasterSymbol } },
        create: {
          masterId: master.id,
          sourceSymbol: masterSymbol,
          normalizedSourceSymbol: normalizedMasterSymbol,
          universalAssetId: asset.id,
          instrumentType: masterInstrumentType,
          masterContractSizeOverride: masterContractSize,
        },
        update: {
          sourceSymbol: masterSymbol,
          universalAssetId: asset.id,
          instrumentType: masterInstrumentType,
          masterContractSizeOverride: masterContractSize,
          active: true,
        },
      });

      await transaction.brokerAssetMapping.upsert({
        where: { brokerAccountId_universalAssetId: { brokerAccountId, universalAssetId: asset.id } },
        create: {
          brokerAccountId,
          universalAssetId: asset.id,
          brokerSymbol,
          normalizedBrokerSymbol,
          instrumentType: brokerInstrumentType,
          contractSize: brokerContractSize,
          conversionMode: brokerConversionMode,
        },
        update: {
          brokerSymbol,
          normalizedBrokerSymbol,
          instrumentType: brokerInstrumentType,
          contractSize: brokerContractSize,
          conversionMode: brokerConversionMode,
          active: true,
        },
      });
    }, { isolationLevel: 'Serializable' });

    process.stdout.write(`Asset mapping saved: ${masterSymbol} -> ${assetCode} -> ${brokerSymbol}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

provisionAssetMapping().catch((error: unknown) => {
  process.stderr.write(`Asset mapping failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});