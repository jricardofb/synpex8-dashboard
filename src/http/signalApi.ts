import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SignalRedis } from '../signals/receiveMasterSignal.js';
import { receiveMasterSignal } from '../signals/receiveMasterSignal.js';
import type { MasterSignalStore } from '../signals/masterSignalStore.js';

const SIGNAL_BODY_LIMIT = 16 * 1024;

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

export interface SignalApiDependencies {
  store: MasterSignalStore;
  redis: SignalRedis;
  encryptionKey: string;
  signatureMaxAgeMs: number;
  rateLimitPerMinute: number;
  corsOrigins?: string[];
}

export async function createSignalApi(dependencies: SignalApiDependencies): Promise<FastifyInstance> {
  const { corsOrigins = ['http://localhost:5173'], ...signalDeps } = dependencies;

  const app = Fastify({ logger: true });

  console.log('CORS_ORIGINS =>', JSON.stringify(corsOrigins)); // 👈 única linha nova

  // CORS no app raiz: vale também para as rotas registradas depois no api.ts
  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Plugin encapsulado: o parser "buffer" só afeta /api/v1/signals
  await app.register(async (scope) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: SIGNAL_BODY_LIMIT },
      (_request, body, done) => done(null, body),
    );

    scope.post('/api/v1/signals', { bodyLimit: SIGNAL_BODY_LIMIT }, async (request, reply) => {
      try {
        const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        const result = await receiveMasterSignal({
          rawBody,
          headers: {
            masterId: singleHeader(request.headers['x-master-id']),
            timestamp: singleHeader(request.headers['x-signal-timestamp']),
            nonce: singleHeader(request.headers['x-signal-nonce']),
            signature: singleHeader(request.headers['x-signal-signature']),
          },
          clientAddress: request.ip,
          ...signalDeps,
        });

        return reply.code(result.statusCode).send(result.body);
      } catch (error) {
        request.log.error(
          { errorName: error instanceof Error ? error.name : 'UnknownError' },
          'Signal intake unavailable',
        );
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
      }
    });
  });

  return app;
}

