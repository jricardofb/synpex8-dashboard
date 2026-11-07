import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { masterSignalSchema } from '../src/signals/masterSignal.js';
import { hashMasterSignal, PrismaMasterSignalStore } from '../src/signals/masterSignalStore.js';

const signal = masterSignalSchema.parse({
  masterAccountId: 'MASTER-1',
  robotId: 'ROBOT-1',
  strategyId: 'STRATEGY-1',
  magicNumber: '1001',
  masterTicketId: 'TICKET-1',
  eventSeq: 1,
  symbol: 'XAUUSD',
  direction: 'BUY',
  masterLot: 0.1,
  masterPrice: 2328.15,
});

function createStore(existingPayloadHash: string | null = null) {
  const findUnique = vi.fn(async () => existingPayloadHash ? { payloadHash: existingPayloadHash } : null);
  const createSignal = vi.fn(async () => ({ id: 'signal-1' }));
  const createOutbox = vi.fn(async () => ({ id: 'outbox-1' }));
  const transaction = {
    masterSignal: { findUnique, create: createSignal },
    signalOutbox: { create: createOutbox },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    masterSignal: { findUnique },
  } as unknown as PrismaClient;

  return { store: new PrismaMasterSignalStore(prisma), createSignal, createOutbox };
}

describe('Prisma Master signal store', () => {
  it('creates the signal and outbox record for a new sequence', async () => {
    const { store, createSignal, createOutbox } = createStore();

    const result = await store.persistSignal('master-db-id', signal);

    expect(result).toBe('CREATED');
    expect(createSignal).toHaveBeenCalledOnce();
    expect(createOutbox).toHaveBeenCalledWith({ data: { signalId: 'signal-1' } });
  });

  it('returns duplicate for the same normalized payload and conflict for changed content', async () => {
    const duplicateStore = createStore(hashMasterSignal(signal));
    const conflictStore = createStore('different-payload-hash');

    await expect(duplicateStore.store.persistSignal('master-db-id', signal)).resolves.toBe('DUPLICATE');
    await expect(conflictStore.store.persistSignal('master-db-id', signal)).resolves.toBe('CONFLICT');
    expect(duplicateStore.createOutbox).not.toHaveBeenCalled();
    expect(conflictStore.createSignal).not.toHaveBeenCalled();
  });
});