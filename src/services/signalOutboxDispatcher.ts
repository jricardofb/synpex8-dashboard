import { Prisma, type PrismaClient } from '@prisma/client';

export interface SignalOutboxJob {
  signalId: string;
}

export interface SignalQueue {
  add(name: string, data: SignalOutboxJob, options: {
    jobId: string;
    removeOnComplete: false;
    removeOnFail: false;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
  }): Promise<unknown>;
}

export interface ClaimedSignalOutbox {
  id: string;
  signalId: string;
  attempts: number;
}

export interface SignalOutboxRepository {
  claimBatch(input: { batchSize: number; now: Date; staleBefore: Date }): Promise<ClaimedSignalOutbox[]>;
  markPublished(id: string, now: Date): Promise<void>;
  markFailure(input: { id: string; attempts: number; error: string; availableAt: Date; now: Date; maxAttempts: number }): Promise<void>;
}

export interface SignalOutboxDispatcherConfig {
  batchSize?: number;
  claimTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  maxAttempts?: number;
  now?: () => Date;
}

const SIGNAL_QUEUE_NAME = 'master-signals';

export class PrismaSignalOutboxRepository implements SignalOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimBatch({ batchSize, now, staleBefore }: { batchSize: number; now: Date; staleBefore: Date }): Promise<ClaimedSignalOutbox[]> {
    return this.prisma.$transaction((transaction) => transaction.$queryRaw<ClaimedSignalOutbox[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "SignalOutbox"
        WHERE ("status" = 'PENDING'::"SignalOutboxStatus" AND "availableAt" <= ${now})
          OR ("status" = 'PROCESSING'::"SignalOutboxStatus" AND "lockedAt" <= ${staleBefore})
        ORDER BY "availableAt", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE "SignalOutbox" AS outbox
      SET "status" = 'PROCESSING'::"SignalOutboxStatus",
          "lockedAt" = ${now},
          "attempts" = outbox."attempts" + 1,
          "updatedAt" = ${now}
      FROM candidates
      WHERE outbox."id" = candidates."id"
      RETURNING outbox."id", outbox."signalId", outbox."attempts"
    `));
  }

  async markPublished(id: string, now: Date): Promise<void> {
    await this.prisma.signalOutbox.updateMany({
      where: { id, status: 'PROCESSING' },
      data: { status: 'PROCESSED', lockedAt: null, lastError: null, updatedAt: now },
    });
  }

  async markFailure({ id, attempts, error, availableAt, now, maxAttempts }: {
    id: string;
    attempts: number;
    error: string;
    availableAt: Date;
    now: Date;
    maxAttempts: number;
  }): Promise<void> {
    await this.prisma.signalOutbox.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: attempts >= maxAttempts ? 'FAILED' : 'PENDING',
        lockedAt: null,
        lastError: error.slice(0, 1000),
        availableAt,
        updatedAt: now,
      },
    });
  }
}

export class SignalOutboxDispatcher {
  private readonly batchSize: number;
  private readonly claimTimeoutMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly maxAttempts: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: SignalOutboxRepository,
    private readonly queue: SignalQueue,
    config: SignalOutboxDispatcherConfig = {},
  ) {
    this.batchSize = config.batchSize ?? 50;
    this.claimTimeoutMs = config.claimTimeoutMs ?? 30_000;
    this.retryBaseMs = config.retryBaseMs ?? 1_000;
    this.retryMaxMs = config.retryMaxMs ?? 60_000;
    this.maxAttempts = config.maxAttempts ?? 10;
    this.now = config.now ?? (() => new Date());
  }

  async dispatchBatch(): Promise<{ claimed: number; published: number; failed: number }> {
    const now = this.now();
    const claimed = await this.repository.claimBatch({
      batchSize: this.batchSize,
      now,
      staleBefore: new Date(now.getTime() - this.claimTimeoutMs),
    });
    let published = 0;
    let failed = 0;

    for (const outbox of claimed) {
      const publishedAt = this.now();
      try {
        await this.queue.add(SIGNAL_QUEUE_NAME, { signalId: outbox.signalId }, {
          jobId: outbox.signalId,
          removeOnComplete: false,
          removeOnFail: false,
          attempts: 8,
          backoff: { type: 'exponential', delay: 1_000 },
        });
        await this.repository.markPublished(outbox.id, publishedAt);
        published += 1;
      } catch (error) {
        const delay = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** Math.max(0, outbox.attempts - 1)));
        await this.repository.markFailure({
          id: outbox.id,
          attempts: outbox.attempts,
          error: error instanceof Error ? error.message : 'Unknown queue publishing error',
          availableAt: new Date(publishedAt.getTime() + delay),
          now: publishedAt,
          maxAttempts: this.maxAttempts,
        });
        failed += 1;
      }
    }

    return { claimed: claimed.length, published, failed };
  }
}