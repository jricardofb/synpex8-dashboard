import 'dotenv/config';
import { Redis } from 'ioredis';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { prisma } from './config/prisma.js';
import { PrismaMasterSignalStore } from './signals/masterSignalStore.js';
import { validateMasterSecretEncryptionKey } from './signals/security.js';
import type { SignalRedis } from './signals/receiveMasterSignal.js';
import { createSignalApi } from './http/signalApi.js';
import { dashboardRoutes } from './http/dashboard.routes.js';
import { accountsRoutes } from './http/accounts.routes.js';
import { strategyRoutes } from './http/strategy.routes.js';


const apiEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(?:ql)?:\/\//.test(v), {
      message: 'DATABASE_URL deve começar com postgres:// ou postgresql://',
    }),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  MASTER_SECRET_ENCRYPTION_KEY: z.string().min(1),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SIGNAL_SIGNATURE_MAX_AGE_MS: z.coerce.number().int().positive().default(60_000),
  SIGNAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
});

async function startApi(): Promise<void> {
  const parsed = apiEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  const config = parsed.data;
  validateMasterSecretEncryptionKey(config.MASTER_SECRET_ENCRYPTION_KEY);

  const redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  // Listener temporário até o app existir (evita crash por 'error' sem handler)
  const earlyErrorHandler = (err: Error) =>
    process.stderr.write(`Redis error (startup): ${err.message}\n`);
  redisClient.on('error', earlyErrorHandler);

  const redis: SignalRedis = {
    async eval(script, numberOfKeys, key, ttlSeconds) {
      return Number(await redisClient.eval(script, numberOfKeys, key, String(ttlSeconds)));
    },
    async set(key, value, expiryMode, milliseconds, condition) {
      const result = await redisClient.set(key, value, expiryMode, milliseconds, condition);
      return result === 'OK' ? 'OK' : null;
    },
  };

  let app: FastifyInstance | undefined;

  try {
    app = await createSignalApi({
      store: new PrismaMasterSignalStore(prisma),
      redis,
      encryptionKey: config.MASTER_SECRET_ENCRYPTION_KEY,
      signatureMaxAgeMs: config.SIGNAL_SIGNATURE_MAX_AGE_MS,
      rateLimitPerMinute: config.SIGNAL_RATE_LIMIT_PER_MINUTE,
      corsOrigins: config.CORS_ORIGINS,
    });

    const log = app.log;
    redisClient.off('error', earlyErrorHandler);
    redisClient.on('error', (err: Error) => log.error({ err }, 'Redis connection error'));

    app.addHook('onClose', async () => {
      await Promise.allSettled([prisma.$disconnect(), redisClient.quit()]);
    });

    await app.register(dashboardRoutes, { prisma, redisClient });
    await app.register(accountsRoutes, { prisma });
    await app.register(strategyRoutes, { prisma });

    await app.ready();
    console.log(app.printRoutes());
    await app.listen({ host: config.HOST, port: config.PORT });

  } catch (err) {
    if (app) await app.close().catch(() => undefined);
    else await Promise.allSettled([prisma.$disconnect(), redisClient.quit()]);
    throw err;
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    app!.log.info(`${signal} recebido, encerrando...`);
    try {
      await app!.close();
      process.exit(0);
    } catch (err) {
      app!.log.error({ err }, 'Erro no shutdown');
      process.exit(1);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startApi().catch((error: unknown) => {
  process.stderr.write(
    `API startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
