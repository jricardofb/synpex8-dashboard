import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
});

const argsSchema = z.tuple([
  z.string().trim().min(1).max(128),
  z.string().trim().min(1).max(128),
  z.string().trim().min(1).max(128),
  z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).refine((value) => Number.isFinite(value) && value > 0),
]);

async function provisionClientRobot(): Promise<void> {
  const parsedArgs = argsSchema.safeParse(process.argv.slice(2));
  if (!parsedArgs.success) {
    throw new Error('Usage: npx tsx src/provisionClientRobot.ts <CLIENT_EXTERNAL_ID> <ROBOT_EXTERNAL_ID> <NAME> <CONFIGURED_VOLUME>');
  }

  const [clientExternalId, robotExternalId, name, configuredVolume] = parsedArgs.data;
  const config = environmentSchema.parse(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });

  try {
    const client = await prisma.client.findUnique({
      where: { externalId: clientExternalId },
      select: { id: true },
    });
    if (!client) throw new Error(`Client ${clientExternalId} was not found`);

    const existing = await prisma.robot.findUnique({
      where: { externalId: robotExternalId },
      select: { clientId: true },
    });
    if (existing) {
      if (existing.clientId !== client.id) throw new Error(`Robot ${robotExternalId} is assigned to another client`);
      process.stdout.write(`Client robot ${robotExternalId} already exists; existing settings were not changed.\n`);
      return;
    }

    await prisma.robot.create({
      data: {
        externalId: robotExternalId,
        clientId: client.id,
        name,
        configuredVolume,
        status: 'OFF',
      },
    });

    process.stdout.write(`Client robot ${robotExternalId} created for ${clientExternalId} in OFF mode.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

provisionClientRobot().catch((error: unknown) => {
  process.stderr.write(`Client robot provisioning failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
