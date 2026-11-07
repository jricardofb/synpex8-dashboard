import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SignalRedis } from '../signals/receiveMasterSignal.js';
import { receiveMasterSignal } from '../signals/receiveMasterSignal.js';
import type { MasterSignalStore } from '../signals/masterSignalStore.js';
const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });
await app.register(cors, {
  origin: 'http://localhost:5173',
});

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

export interface SignalApiDependencies {
  store: MasterSignalStore;
  redis: SignalRedis;
  encryptionKey: string;
  signatureMaxAgeMs: number;
  rateLimitPerMinute: number;
}

export function createSignalApi(dependencies: SignalApiDependencies): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  //app.get('/health', async () => ({ status: 'ok' }));

  app.post('/api/v1/signals', async (request, reply) => {
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
        ...dependencies,
      });

      return reply.code(result.statusCode).send(result.body);
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Signal intake unavailable');
      return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
    }
  });

  return app;
}