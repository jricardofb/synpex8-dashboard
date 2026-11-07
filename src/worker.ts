import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import { SignalDryRunProcessor, PrismaSignalDryRunStore } from './services/signalDryRun.js';
import {
  PrismaSignalOutboxRepository,
  SignalOutboxDispatcher,
  type SignalOutboxJob,
  type SignalQueue,
} from './services/signalOutboxDispatcher.js';

const workerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(500),
});

async function startOutboxRelay(): Promise<void> {
  const config = workerEnvSchema.parse(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });
  const queue = new Queue<SignalOutboxJob>('master-signals', {
    connection: { url: config.REDIS_URL, maxRetriesPerRequest: null },
  });
  const signalProcessor = new SignalDryRunProcessor(new PrismaSignalDryRunStore(prisma));
  const consumer = new Worker<SignalOutboxJob>('master-signals', async (job) => {
    const result = await signalProcessor.process(job.data.signalId);
    process.stdout.write(`Signal dry-run: signalId=${job.data.signalId} status=${result.status} destinations=${result.destinationCount}\n`);
    return result;
  }, {
    connection: { url: config.REDIS_URL, maxRetriesPerRequest: null },
  });
  const signalQueue: SignalQueue = {
    add(name, data, options) {
      return queue.add(name, data, options);
    },
  };
  const dispatcher = new SignalOutboxDispatcher(new PrismaSignalOutboxRepository(prisma), signalQueue);
  let stopping = false;

  queue.on('error', (error: Error) => {
    process.stderr.write(`Outbox queue error: ${JSON.stringify({ name: error.name, message: error.message, stack: error.stack })}\n`);
  });
  consumer.on('error', (error: Error) => {
    process.stderr.write(`Signal dry-run worker error: ${JSON.stringify({ name: error.name, message: error.message, stack: error.stack })}\n`);
  });
  consumer.on('failed', (job, error: Error) => {
    process.stderr.write(`Signal dry-run attempt failed: signalId=${job?.data.signalId ?? 'unknown'} attempts=${job?.attemptsMade ?? 0} error=${error.message}\n`);
  });

  const stop = () => { stopping = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  process.stdout.write('Signal outbox relay and dry-run consumer started; broker order execution is disabled.\n');

  try {
    while (!stopping) {
      try {
        const result = await dispatcher.dispatchBatch();
        if (result.claimed > 0) {
          process.stdout.write(`Outbox batch: claimed=${result.claimed} published=${result.published} failed=${result.failed}\n`);
        }
      } catch (error) {
        process.stderr.write(`Outbox dispatch error: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      }

      if (!stopping) await new Promise((resolve) => setTimeout(resolve, config.OUTBOX_POLL_INTERVAL_MS));
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await Promise.all([queue.close(), consumer.close(), prisma.$disconnect()]);
  }
}

startOutboxRelay().catch((error: unknown) => {
  process.stderr.write(`Outbox relay startup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});