import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { PrismaMasterSignalStore } from './signals/masterSignalStore.js';
import { validateMasterSecretEncryptionKey } from './signals/security.js';
import { createSignalApi } from './http/signalApi.js';
import type { SignalRedis } from './signals/receiveMasterSignal.js';
import { registerDashboardRoutes } from './http/dashboardApi.js';
import { dashboardRoutes } from "./http/dashboard.routes.js";

const apiEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  MASTER_SECRET_ENCRYPTION_KEY: z.string().min(1),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SIGNAL_SIGNATURE_MAX_AGE_MS: z.coerce.number().int().positive().default(60_000),
  SIGNAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
});

async function startApi(): Promise<void> {
  const config = apiEnvSchema.parse(process.env);
  validateMasterSecretEncryptionKey(config.MASTER_SECRET_ENCRYPTION_KEY);

  // 1. Instanciar Prisma e Redis primeiro
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });
  
  const redisClient = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  const redis: SignalRedis = {
    async eval(script, numberOfKeys, key, ttlSeconds) {
      return Number(await redisClient.eval(script, numberOfKeys, key, String(ttlSeconds)));
    },
    async set(key, value, expiryMode, milliseconds, condition) {
      const result = await redisClient.set(key, value, expiryMode, milliseconds, condition);
      return result === 'OK' ? 'OK' : null;
    },
  };

  // 2. Criar a instância do Fastify (app nasce aqui)
  const app = await createSignalApi({
    store: new PrismaMasterSignalStore(prisma),
    redis,
    encryptionKey: config.MASTER_SECRET_ENCRYPTION_KEY,
    signatureMaxAgeMs: config.SIGNAL_SIGNATURE_MAX_AGE_MS,
    rateLimitPerMinute: config.SIGNAL_RATE_LIMIT_PER_MINUTE,
  });

  // 3. Registar as rotas com o app já instanciado
  await registerDashboardRoutes(app, { prisma });
  await app.register(dashboardRoutes, { prisma, redisClient });

  // 4. Configurar eventos, hooks e subida do servidor
  redisClient.on('error', (error: Error) => {
    app.log.error({ err: error }, 'Redis connection error');
  });

  app.addHook('onClose', async () => {
    await Promise.all([prisma.$disconnect(), redisClient.quit()]);
  });

  await app.listen({ host: config.HOST, port: config.PORT });
}

startApi().catch((error: unknown) => {
  process.stderr.write(`API startup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});