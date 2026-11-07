import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createSignalApi } from '../src/http/signalApi.js';
import type { MasterSignalStore } from '../src/signals/masterSignalStore.js';
import { encryptMasterSecret } from '../src/signals/security.js';
import type { SignalRedis } from '../src/signals/receiveMasterSignal.js';

const masterId = 'MASTER-1';
const secret = 'api-test-secret';
const encryptionKey = Buffer.alloc(32, 4).toString('base64');
const signal = {
  masterAccountId: masterId,
  robotId: 'ROBOT-1',
  strategyId: 'STRATEGY-1',
  magicNumber: 1001,
  masterTicketId: 12345,
  eventType: 'OPEN',
  eventSeq: 1,
  symbol: 'XAUUSD',
  direction: 'BUY',
  masterLot: 0.1,
  masterPrice: 2328.15,
};

function createTestDependencies() {
  const usedNonces = new Set<string>();
  const persistSignal = vi.fn(async () => 'CREATED' as const);
  const store: MasterSignalStore = {
    async findMaster(externalId) {
      return externalId === masterId
        ? { id: 'master-db-id', active: true, encryptedSecret: encryptMasterSecret(secret, encryptionKey, masterId) }
        : null;
    },
    persistSignal,
  };
  const redis: SignalRedis = {
    async eval() { return 1; },
    async set(key) {
      if (usedNonces.has(key)) return null;
      usedNonces.add(key);
      return 'OK';
    },
  };

  return { store, redis, persistSignal };
}

function signedHeaders(body: string, nonce = 'nonce-0123456789abcdef') {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.`)
    .update(Buffer.from(body))
    .digest('hex');

  return {
    'content-type': 'application/json',
    'x-master-id': masterId,
    'x-signal-timestamp': timestamp,
    'x-signal-nonce': nonce,
    'x-signal-signature': signature,
  };
}

describe('Master signal HTTP API', () => {
  it('accepts a valid raw-body signature and returns 202', async () => {
    const dependencies = createTestDependencies();
    const app = createSignalApi({
      ...dependencies,
      encryptionKey,
      signatureMaxAgeMs: 60_000,
      rateLimitPerMinute: 10,
    });
    const body = JSON.stringify(signal);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/signals',
        headers: signedHeaders(body),
        payload: body,
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ accepted: true, duplicate: false });
      expect(dependencies.persistSignal).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('rejects invalid JSON without looking up a Master', async () => {
    const dependencies = createTestDependencies();
    const app = createSignalApi({
      ...dependencies,
      encryptionKey,
      signatureMaxAgeMs: 60_000,
      rateLimitPerMinute: 10,
    });
    const body = '{invalid';

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/signals',
        headers: signedHeaders(body),
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'INVALID_JSON' });
      expect(dependencies.persistSignal).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 503 when Redis is unavailable instead of accepting without replay protection', async () => {
    const dependencies = createTestDependencies();
    const app = createSignalApi({
      ...dependencies,
      redis: {
        ...dependencies.redis,
        async eval() { throw new Error('Redis unavailable'); },
      },
      encryptionKey,
      signatureMaxAgeMs: 60_000,
      rateLimitPerMinute: 10,
    });
    const body = JSON.stringify(signal);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/signals',
        headers: signedHeaders(body),
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'SERVICE_UNAVAILABLE' });
      expect(dependencies.persistSignal).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});