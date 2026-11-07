import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { MasterSignalStore } from '../src/signals/masterSignalStore.js';
import { encryptMasterSecret } from '../src/signals/security.js';
import { receiveMasterSignal, type SignalRedis } from '../src/signals/receiveMasterSignal.js';

const masterId = 'MASTER-1';
const secret = 'test-master-secret';
const encryptionKey = Buffer.alloc(32, 9).toString('base64');
const nowMs = Date.now();
const signal = {
  masterAccountId: masterId,
  robotId: 'ROBOT-1',
  strategyId: 'STRATEGY-1',
  magicNumber: '1001',
  masterTicketId: 'TICKET-1',
  eventType: 'OPEN',
  eventSeq: 1,
  symbol: 'XAUUSD',
  direction: 'BUY',
  masterLot: 0.1,
  masterPrice: 2328.15,
};

function createRedis(): SignalRedis {
  const counters = new Map<string, number>();
  const nonces = new Set<string>();
  return {
    async eval(_script, _numberOfKeys, key) {
      const value = (counters.get(key) ?? 0) + 1;
      counters.set(key, value);
      return value;
    },
    async set(key) {
      if (nonces.has(key)) return null;
      nonces.add(key);
      return 'OK';
    },
  };
}

function signedRequest(nonce: string) {
  const rawBody = Buffer.from(JSON.stringify(signal));
  const timestamp = String(nowMs);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.`)
    .update(rawBody)
    .digest('hex');

  return {
    rawBody,
    headers: { masterId, timestamp, nonce, signature },
    clientAddress: '10.0.0.8',
    encryptionKey,
    signatureMaxAgeMs: 60_000,
    rateLimitPerMinute: 30,
    nowMs,
  };
}

function createStore(persistSignal: MasterSignalStore['persistSignal']): MasterSignalStore {
  return {
    async findMaster(externalId) {
      if (externalId !== masterId) return null;
      return {
        id: 'master-db-id',
        active: true,
        encryptedSecret: encryptMasterSecret(secret, encryptionKey, masterId),
      };
    },
    persistSignal,
  };
}

describe('receive Master signal', () => {
  it('authenticates exact bytes and persists an accepted event', async () => {
    const persistSignal = vi.fn(async () => 'CREATED' as const);
    const result = await receiveMasterSignal({
      ...signedRequest('nonce-00000000000001'),
      redis: createRedis(),
      store: createStore(persistSignal),
    });

    expect(result).toEqual({ statusCode: 202, body: { accepted: true, duplicate: false } });
    expect(persistSignal).toHaveBeenCalledOnce();
  });

  it('rejects a reused nonce but accepts an event retry with a fresh nonce as a duplicate', async () => {
    const persistSignal = vi.fn()
      .mockResolvedValueOnce('CREATED' as const)
      .mockResolvedValueOnce('DUPLICATE' as const);
    const redis = createRedis();
    const store = createStore(persistSignal);

    const first = await receiveMasterSignal({ ...signedRequest('nonce-00000000000002'), redis, store });
    const replay = await receiveMasterSignal({ ...signedRequest('nonce-00000000000002'), redis, store });
    const retry = await receiveMasterSignal({ ...signedRequest('nonce-00000000000003'), redis, store });

    expect(first.statusCode).toBe(202);
    expect(replay).toEqual({ statusCode: 401, body: { error: 'UNAUTHORIZED' } });
    expect(retry).toEqual({ statusCode: 200, body: { accepted: true, duplicate: true } });
    expect(persistSignal).toHaveBeenCalledTimes(2);
  });

  it('enforces the request rate limit before persisting excess traffic', async () => {
    const persistSignal = vi.fn(async () => 'CREATED' as const);
    const store = createStore(persistSignal);
    const redis = createRedis();
    const first = await receiveMasterSignal({
      ...signedRequest('nonce-00000000000004'),
      rateLimitPerMinute: 1,
      redis,
      store,
    });
    const second = await receiveMasterSignal({
      ...signedRequest('nonce-00000000000005'),
      rateLimitPerMinute: 1,
      redis,
      store,
    });

    expect(first.statusCode).toBe(202);
    expect(second).toEqual({ statusCode: 429, body: { error: 'RATE_LIMITED' } });
    expect(persistSignal).toHaveBeenCalledOnce();
  });
});