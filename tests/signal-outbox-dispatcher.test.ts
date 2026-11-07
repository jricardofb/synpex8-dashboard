import { describe, expect, it, vi } from 'vitest';
import {
  SignalOutboxDispatcher,
  type ClaimedSignalOutbox,
  type SignalOutboxRepository,
  type SignalQueue,
} from '../src/services/signalOutboxDispatcher.js';

const fixedNow = new Date('2026-10-11T12:00:00.000Z');

function createRepository(records: ClaimedSignalOutbox[]) {
  const repository: SignalOutboxRepository = {
    claimBatch: vi.fn(async () => records),
    markPublished: vi.fn(async () => {}),
    markFailure: vi.fn(async () => {}),
  };
  return repository;
}

describe('signal outbox dispatcher', () => {
  it('publishes deterministic signal jobs and marks outbox rows as dispatched', async () => {
    const repository = createRepository([{ id: 'outbox-1', signalId: 'signal-1', attempts: 1 }]);
    const queue: SignalQueue = { add: vi.fn(async () => ({ id: 'signal-1' })) };
    const dispatcher = new SignalOutboxDispatcher(repository, queue, { now: () => fixedNow });

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(queue.add).toHaveBeenCalledWith('master-signals', { signalId: 'signal-1' }, {
      jobId: 'signal-1',
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 8,
      backoff: { type: 'exponential', delay: 1_000 },
    });
    expect(repository.markPublished).toHaveBeenCalledWith('outbox-1', fixedNow);
  });

  it('schedules a failed publish with capped exponential backoff', async () => {
    const repository = createRepository([{ id: 'outbox-2', signalId: 'signal-2', attempts: 3 }]);
    const queue: SignalQueue = { add: vi.fn(async () => { throw new Error('Redis queue unavailable'); }) };
    const dispatcher = new SignalOutboxDispatcher(repository, queue, {
      retryBaseMs: 1_000,
      retryMaxMs: 5_000,
      maxAttempts: 10,
      now: () => fixedNow,
    });

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({ claimed: 1, published: 0, failed: 1 });
    expect(repository.markFailure).toHaveBeenCalledWith({
      id: 'outbox-2',
      attempts: 3,
      error: 'Redis queue unavailable',
      availableAt: new Date(fixedNow.getTime() + 4_000),
      now: fixedNow,
      maxAttempts: 10,
    });
  });

  it('marks an outbox row failed after its retry budget is exhausted', async () => {
    const repository = createRepository([{ id: 'outbox-3', signalId: 'signal-3', attempts: 10 }]);
    const queue: SignalQueue = { add: vi.fn(async () => { throw new Error('persistent queue error'); }) };
    const dispatcher = new SignalOutboxDispatcher(repository, queue, { now: () => fixedNow });

    await dispatcher.dispatchBatch();

    expect(repository.markFailure).toHaveBeenCalledWith(expect.objectContaining({
      id: 'outbox-3',
      attempts: 10,
      maxAttempts: 10,
    }));
  });
});