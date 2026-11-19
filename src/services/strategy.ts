import { z } from 'zod';
//import { Prisma } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { AppPrisma } from '../config/prisma.js';

const symbolsSchema = z
  .array(z.string().trim().min(1).toUpperCase())
  .transform((arr) => [...new Set(arr)]);

const baseSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1000).nullish(),
  mode: z.enum(['DRY_RUN', 'LIVE']),
  isActive: z.boolean(),
  symbols: symbolsSchema,
  riskPercent: z.number().min(0.1).max(100),
  maxPositions: z.number().int().min(1),
  config: z.record(z.string(), z.unknown()),
});

export const strategySchema = baseSchema.extend({
  mode: baseSchema.shape.mode.default('DRY_RUN'),
  isActive: baseSchema.shape.isActive.default(false),
  symbols: symbolsSchema.default([]),
  riskPercent: baseSchema.shape.riskPercent.default(1),
  maxPositions: baseSchema.shape.maxPositions.default(1),
  config: baseSchema.shape.config.default({}),
});

export const strategyUpdateSchema = baseSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Nenhum campo para atualizar' },
);

export type StrategyInput = z.infer<typeof strategySchema>;
export type StrategyUpdateInput = z.infer<typeof strategyUpdateSchema>;

export class StrategyNotFoundError extends Error {
  constructor() { super('STRATEGY_NOT_FOUND'); this.name = 'StrategyNotFoundError'; }
}
export class StrategyInUseError extends Error {
  constructor() { super('STRATEGY_IN_USE'); this.name = 'StrategyInUseError'; }
}

const toDto = <T extends { riskPercent: Prisma.Decimal }>(s: T, signals: number) => ({
  ...s,
  riskPercent: s.riskPercent.toNumber(),
  _count: { signals },
});

const mapError = (err: unknown): never => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    throw new StrategyNotFoundError();
  }
  throw err;
};

const toJson = (config?: Record<string, unknown>) =>
  config as Prisma.InputJsonValue | undefined;

export function createStrategyService(prisma: AppPrisma) {
  // MasterSignal.strategyId é texto externo (sem FK): a contagem é feita por valor.
  async function signalCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.masterSignal.groupBy({
      by: ['strategyId'],
      where: { strategyId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.strategyId, r._count._all]));
  }

  const service = {
    async list() {
      const rows = await prisma.strategy.findMany({ orderBy: { createdAt: 'desc' } });
      const counts = await signalCounts(rows.map((r) => r.id));
      return rows.map((r) => toDto(r, counts.get(r.id) ?? 0));
    },

    async get(id: string) {
      const s = await prisma.strategy.findUnique({ where: { id } });
      if (!s) throw new StrategyNotFoundError();
      const counts = await signalCounts([id]);
      return toDto(s, counts.get(id) ?? 0);
    },

    async create(data: StrategyInput) {
      const s = await prisma.strategy.create({
        data: { ...data, config: toJson(data.config)! },
      });
      return toDto(s, 0);
    },

    async update(id: string, data: StrategyUpdateInput) {
      const { config, ...rest } = data;
      const s = await prisma.strategy
        .update({
          where: { id },
          data: { ...rest, ...(config !== undefined && { config: toJson(config) }) },
        })
        .catch(mapError);
      const counts = await signalCounts([id]);
      return toDto(s, counts.get(id) ?? 0);
    },

    async toggle(id: string) {
      const affected = await prisma.$executeRaw`
        UPDATE "Strategy"
        SET "isActive" = NOT "isActive", "updatedAt" = NOW()
        WHERE id = ${id}`;
      if (affected === 0) throw new StrategyNotFoundError();
      return service.get(id);
    },

    async remove(id: string) {
      const [signals, routes] = await Promise.all([
        prisma.masterSignal.count({ where: { strategyId: id } }),
        prisma.copyTradingRoute.count({ where: { strategyId: id } }),
      ]);
      if (signals > 0 || routes > 0) throw new StrategyInUseError();
      await prisma.strategy.delete({ where: { id } }).catch(mapError);
    },
  };
  return service;
}