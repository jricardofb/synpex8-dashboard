import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
    message: 'DATABASE_URL must be a PostgreSQL URL, for example: postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require',
  }),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function validateEnv(envLike: Record<string, string | undefined> = process.env) {
  return envSchema.parse(envLike);
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'test' | 'production' | undefined) ?? 'development',
};

export function getDatabaseUrl(): string {
  return validateEnv(process.env).DATABASE_URL;
}
