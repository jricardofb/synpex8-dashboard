import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { AppPrisma } from '../config/prisma.js';

export type PrismaOptions = { prisma: AppPrisma };

export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

type Mapper = (err: unknown) => HttpError | undefined;

export function routeErrorHandler(fallbackCode: string, map?: Mapper) {
  return (err: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ZodError)
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: err.issues });

    const mapped = err instanceof HttpError ? err : map?.(err);
    if (mapped) return reply.code(mapped.statusCode).send({ error: mapped.code, message: mapped.message });

    const status = (err as FastifyError).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: err.message });

    request.log.error({ err }, fallbackCode);
    return reply.code(500).send({ error: fallbackCode });
  };
}
