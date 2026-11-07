import { decryptMasterSecret, verifyMasterSignature } from './security.js';
import { masterSignalSchema } from './masterSignal.js';
import type { MasterSignalStore } from './masterSignalStore.js';

export interface SignalRedis {
  eval(script: string, numberOfKeys: number, key: string, ttlSeconds: number): Promise<number | string>;
  set(key: string, value: string, expiryMode: 'PX', milliseconds: number, condition: 'NX'): Promise<'OK' | null>;
}

export interface ReceiveMasterSignalInput {
  rawBody: Buffer;
  headers: {
    masterId?: string;
    timestamp?: string;
    nonce?: string;
    signature?: string;
  };
  clientAddress: string;
  store: MasterSignalStore;
  redis: SignalRedis;
  encryptionKey: string;
  signatureMaxAgeMs: number;
  rateLimitPerMinute: number;
  nowMs?: number;
}

export type ReceiveMasterSignalResult =
  | { statusCode: 200; body: { accepted: true; duplicate: true } }
  | { statusCode: 202; body: { accepted: true; duplicate: false } }
  | { statusCode: 400; body: { error: 'INVALID_JSON' | 'INVALID_SIGNAL' } }
  | { statusCode: 401; body: { error: 'UNAUTHORIZED' } }
  | { statusCode: 409; body: { error: 'EVENT_SEQ_CONFLICT' } }
  | { statusCode: 429; body: { error: 'RATE_LIMITED' } };

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

async function isRateLimited(redis: SignalRedis, key: string, limit: number): Promise<boolean> {
  const count = Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key, 60));
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Redis returned an invalid rate-limit counter');
  return count > limit;
}

export async function receiveMasterSignal({
  rawBody,
  headers,
  clientAddress,
  store,
  redis,
  encryptionKey,
  signatureMaxAgeMs,
  rateLimitPerMinute,
  nowMs = Date.now(),
}: ReceiveMasterSignalInput): Promise<ReceiveMasterSignalResult> {
  if (await isRateLimited(redis, `signal:rate:ip:${clientAddress}`, rateLimitPerMinute)) {
    return { statusCode: 429, body: { error: 'RATE_LIMITED' } };
  }

  if (!headers.masterId || !headers.timestamp || !headers.nonce || !headers.signature) {
    return { statusCode: 401, body: { error: 'UNAUTHORIZED' } };
  }

  let rawSignal: unknown;
  try {
    rawSignal = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { statusCode: 400, body: { error: 'INVALID_JSON' } };
  }

  const parsedSignal = masterSignalSchema.safeParse(rawSignal);
  if (!parsedSignal.success) return { statusCode: 400, body: { error: 'INVALID_SIGNAL' } };

  const signal = parsedSignal.data;
  if (signal.masterAccountId !== headers.masterId) {
    return { statusCode: 401, body: { error: 'UNAUTHORIZED' } };
  }

  const master = await store.findMaster(headers.masterId);
  if (!master?.active) return { statusCode: 401, body: { error: 'UNAUTHORIZED' } };

  let secret: string;
  try {
    secret = decryptMasterSecret(master.encryptedSecret, encryptionKey, headers.masterId);
  } catch {
    return { statusCode: 401, body: { error: 'UNAUTHORIZED' } };
  }

  if (!verifyMasterSignature({
    rawBody,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    signature: headers.signature,
    secret,
    nowMs,
    maxAgeMs: signatureMaxAgeMs,
  })) {
    return { statusCode: 401, body: { error: 'UNAUTHORIZED' } };
  }

  if (await isRateLimited(redis, `signal:rate:master:${master.id}`, rateLimitPerMinute)) {
    return { statusCode: 429, body: { error: 'RATE_LIMITED' } };
  }

  const nonceTtlMs = Math.max(1, signatureMaxAgeMs * 2);
  const nonceAccepted = await redis.set(
    `signal:nonce:${master.id}:${headers.nonce}`,
    '1',
    'PX',
    nonceTtlMs,
    'NX',
  );
  if (nonceAccepted !== 'OK') return { statusCode: 401, body: { error: 'UNAUTHORIZED' } };

  const stored = await store.persistSignal(master.id, signal);
  if (stored === 'CONFLICT') return { statusCode: 409, body: { error: 'EVENT_SEQ_CONFLICT' } };
  if (stored === 'DUPLICATE') return { statusCode: 200, body: { accepted: true, duplicate: true } };
  return { statusCode: 202, body: { accepted: true, duplicate: false } };
}