import type { FastifyPluginAsync } from 'fastify';
import {
    createStrategyService, strategySchema, strategyUpdateSchema,
    StrategyNotFoundError, StrategyInUseError,
} from '../services/strategy.js';
import { HttpError, routeErrorHandler, type PrismaOptions } from './routeUtils.js';

type IdParams = { Params: { id: string } };
const base = '/api/v1/strategies';

export const strategyRoutes: FastifyPluginAsync<PrismaOptions> = async (app, { prisma }) => {
    const svc = createStrategyService(prisma);

    app.setErrorHandler(
        routeErrorHandler('STRATEGY_QUERY_FAILED', (err) => {
            if (err instanceof StrategyNotFoundError) return new HttpError(404, 'STRATEGY_NOT_FOUND', err.message);
            if (err instanceof StrategyInUseError) return new HttpError(409, 'STRATEGY_IN_USE', err.message);
        }),
    );

    app.get(base, async () => ({ data: await svc.list() }));
    app.get<IdParams>(`${base}/:id`, async (req) => ({ data: await svc.get(req.params.id) }));
    app.post(base, async (req, reply) =>
        reply.code(201).send({ data: await svc.create(strategySchema.parse(req.body)) }));
    app.patch<IdParams>(`${base}/:id`, async (req) =>
        ({ data: await svc.update(req.params.id, strategyUpdateSchema.parse(req.body)) }));
    app.patch<IdParams>(`${base}/:id/toggle`, async (req) => ({ data: await svc.toggle(req.params.id) }));
    app.delete<IdParams>(`${base}/:id`, async (req, reply) => {
        await svc.remove(req.params.id);
        return reply.code(204).send();
    });
};
