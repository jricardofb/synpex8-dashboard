import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { encryptMasterSecret, validateMasterSecretEncryptionKey } from './signals/security.js';

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
  MASTER_SECRET_ENCRYPTION_KEY: z.string().min(1),
});

async function provisionMaster(): Promise<void> {
  const externalId = process.argv[2]?.trim();
  if (!externalId || externalId.length > 128) {
    throw new Error('Usage: npx tsx src/provisionMaster.ts <MASTER_EXTERNAL_ID>');
  }

  const config = environmentSchema.parse(process.env);
  validateMasterSecretEncryptionKey(config.MASTER_SECRET_ENCRYPTION_KEY);

  const secret = randomBytes(32).toString('base64url');
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });

  try {
    await prisma.master.create({
      data: {
        externalId,
        encryptedSecret: encryptMasterSecret(secret, config.MASTER_SECRET_ENCRYPTION_KEY, externalId),
      },
    });
    process.stdout.write(`Master ${externalId} provisioned. Configure this secret in the MT5 EA; it will not be shown again.\n${secret}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

provisionMaster().catch((error: unknown) => {
  process.stderr.write(`Master provisioning failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});